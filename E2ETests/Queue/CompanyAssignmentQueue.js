"use strict";

// Company-assignment queue enrollment (CAQ-01..06).
//
// A driver holding the job through a TRANSPORT COMPANY must end up in the queue
// yard exactly like one who wins an individual bid. The path under test:
//
//   shipper creates a company_target order (queue org attached)
//     → company bids
//     → shipper accepts the company offer
//     → company assigns the driver
//     → DRIVER CONFIRMS
//
// Before this the confirm step promoted the JourneyDecision to acceptedByShipper
// (4) while the queue hook in JourneyStatus/update.service.js only fires on
// acceptedByDriver (3). Nothing in Services/CompanyAssignment touched DriverQueue,
// so the driver kept a WAITING row while holding the job — invisible to the yard
// board, which shows trucks by their loadingOrderNumber.
//
// CAQ-01..04 walk that flow. CAQ-05 asserts the driver's EXISTING queue row is
// reused (same queueUniqueId, no second row) — the FIFO position is not thrown
// away. CAQ-06 asserts the double-booking fence: a driver already on this job
// cannot be handed a second company assignment.
//
// Requires a live backend (http://127.0.0.1:3000) and a seeded database.

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData, journeyStatusMap } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const { pool } = require("../../Middleware/Database.config");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const {
  COMPANY_BID_ENDPOINTS,
} = require("../../Routes/EndPoints/companyBid.endpoints");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../../Routes/EndPoints/companyAssignment.endpoints");
const {
  COMPANY_VEHICLE_ENDPOINTS,
} = require("../../Routes/EndPoints/companyVehicle.endpoints");
const {
  ensureCoreUsers,
  ensureQueueDrivers,
} = require("../Auth/bootstrap");
const { ensureUser } = require("../Auth/ensureUser");
const {
  getVehicleTypes,
  registerQueueDrivers,
  onboardQueueDriver,
  activateQueueDriver,
  ensureShipper,
  createQueueOrganization,
  approveQueueOrganization,
  deleteQueueOrganization,
  checkin,
  dbToday,
  resetDriverQueueDay,
  resetDriverJourneyDay,
  getQueueEntryByDriver,
  expectStatus,
} = require("./helpers");
const {
  initiateCompanyProfileSetupWorkFlow,
} = require("../Company/CompanyProfileManagement");

// The driver under test. d1 is used by the org/check-in suites, so d3 keeps this
// file independent of suite ordering.
const DRIVER_KEY = "queueDriver7";

const shipperToken = () => usersData.shipper?.token;
const companyToken = () => usersData.companyAdmin?.token;
const superAdminToken = () => usersData.supperAdmin?.token;
const companyUniqueId = () => usersData.companyAdmin?.companies?.[0]?.companyUniqueId;

const dbError = (error) => {
  const body = error?.response?.data;
  if (body) {
    return `${error.message} :: ${JSON.stringify(body).slice(0, 400)}`;
  }
  return error?.message || String(error);
};

/** Live (non-deleted) DriverQueue rows this driver holds today. */
const liveEntriesFor = async (driverKey) => {
  const [rows] = await pool.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.status, dq.shipperRequestUniqueId,
            dq.loadingOrderNumber, dq.queueOrganizationUniqueId, dq.queueNumber
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Users u          ON u.userUniqueId           = vd.driverUserUniqueId
      WHERE u.phoneNumber = ?
        AND dq.queueDate = ?
        AND dq.queueDeletedAt IS NULL
      ORDER BY dq.queueId ASC`,
    [usersData[driverKey].phoneNumber, dbToday()],
  );
  return rows;
};

/**
 * Shipper creates a company_target order. A company_target batch writes ONLY a
 * batch header — the ShipperRequest rows are minted when the shipper accepts the
 * company bid — so the queue org has to ride on the BATCH header, which is what
 * the queue linkage later reads.
 */
const createCompanyTargetOrder = async ({ queueOrganizationUniqueId, vehicleTypeUniqueId }) => {
  const shippingDate = new Date();
  shippingDate.setDate(shippingDate.getDate() + 1);
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + 3);

  // The batch id is generated HERE rather than read back: the company_target
  // branch of create.service.js returns a status-counts summary, not the created
  // rows (it writes only the batch header).
  const shipperRequestBatchUniqueId = uuidv4();

  await axios.post(
    backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
    {
      shipperRequestBatchUniqueId,
      numberOfVehicles: 1,
      requestMode: "company_target",
      queueOrganizationUniqueId,
      originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
      destination: { latitude: 8.54, longitude: 39.27, description: "Adama" },
      shippingCost: 6000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "CAQ cargo",
      shippingDate: shippingDate.toISOString(),
      deliveryDate: deliveryDate.toISOString(),
      vehicle: { vehicleTypeUniqueId },
    },
    authConfig(shipperToken()),
  );
  return { shipperRequestBatchUniqueId };
};

/** Company submits a bid against that batch. */
const submitCompanyBid = async (shipperRequestBatchUniqueId) => {
  const res = await axios.post(
    backendURL + COMPANY_BID_ENDPOINTS.CREATE_BID,
    {
      shipperRequestBatchUniqueId,
      companyUniqueId: companyUniqueId(),
      proposedCostPerVehicle: "90000",
    },
    authConfig(companyToken()),
  );
  return res.data?.data;
};

/** Shipper selects the company's offer — this mints the ShipperRequest rows. */
const acceptCompanyOffer = async (companyBidRequestUniqueId) => {
  const res = await axios.patch(
    backendURL +
      COMPANY_BID_ENDPOINTS.UPDATE_BID_STATUS.replace(
        ":companyBidRequestUniqueId",
        companyBidRequestUniqueId,
      ),
    { bidStatus: "accepted_by_shipper" },
    authConfig(shipperToken()),
  );
  return res.data?.data;
};

const createAssignment = async ({ companyBidRequestUniqueId }) => {
  const driver = queueState.drivers[DRIVER_KEY];
  const res = await axios.post(
    backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.CREATE_ASSIGNMENT,
    {
      companyBidRequestUniqueId,
      vehicleUniqueId: driver.vehicleUniqueId,
      driverUserUniqueId: driver.userUniqueId,
    },
    authConfig(companyToken()),
  );
  return res.data?.data;
};

const confirmAssignment = async (assignmentUniqueId) => {
  const res = await axios.patch(
    backendURL +
      COMPANY_ASSIGNMENT_ENDPOINTS.UPDATE_ASSIGNMENT_STATUS.replace(
        ":assignmentUniqueId",
        assignmentUniqueId,
      ),
    {
      assignmentStatus: "confirmed_by_driver",
      originLatitude: 9.03,
      originLongitude: 38.74,
      originPlace: "Addis Ababa",
    },
    authConfig(companyToken()),
  );
  return res.data?.data;
};

// ── The flow ───────────────────────────────────────────────────────────────

const runCompanyAssignmentQueueTests = async () => {
  console.log("───── Company-assignment queue (CAQ) ─────");

  let orgUniqueId = null;
  const createdBatchIds = [];
  const createdAssignmentIds = [];

  try {
    // ── Setup ────────────────────────────────────────────────────────────
    await ensureCoreUsers({ fetchAccount: false });
    // queueDriver7 is reserved for this file. queueDriver1..5 are all claimed by
    // earlier sections (verifyLoadingStages/QYA-40 alone leaves d5 mid-journey at
    // status 7), and a driver who still holds a journey cannot check in — the
    // endpoint answers "already in journey" with no queue row, which would make
    // this scenario silently depend on suite ordering. Index 7 is past every
    // other section's highest driver.
    await ensureQueueDrivers({ count: 7 });
    await registerQueueDrivers();
    await onboardQueueDriver({ driverKey: DRIVER_KEY, vehicleTypeIndex: 0 });
    await activateQueueDriver(DRIVER_KEY);
    await ensureShipper();

    const types = await getVehicleTypes();
    const vehicleTypeUniqueId = types[0].vehicleTypeUniqueId;

    await ensureUser({ userType: "companyAdmin", options: { fetchAccount: false } });
    await initiateCompanyProfileSetupWorkFlow({ userType: "companyAdmin" });
    if (!companyUniqueId()) {
      throw new Error("company admin has no company — cannot bid");
    }

    // The company may only bid once it owns an active vehicle of the order's
    // type, so hand it the very truck this driver will be assigned to drive.
    const driverVehicle = queueState.drivers[DRIVER_KEY].vehicleUniqueId;
    if (!driverVehicle) {
      throw new Error("driver vehicleUniqueId not recorded — cannot build the company fleet");
    }
    // Best-effort: a repeated run may already hold this vehicle in the fleet.
    await axios
      .post(
        backendURL + COMPANY_VEHICLE_ENDPOINTS.ASSIGN_VEHICLE,
        { companyUniqueId: companyUniqueId(), vehicleUniqueId: driverVehicle },
        authConfig(companyToken()),
      )
      .catch(() => {});

    const org = await createQueueOrganization(`CAQ-org-${Date.now()}`, superAdminToken());
    orgUniqueId = org.queueOrganizationUniqueId || org?.data?.queueOrganizationUniqueId;
    if (!orgUniqueId) throw new Error("could not create the throwaway queue org");
    await approveQueueOrganization({
      queueOrganizationUniqueId: orgUniqueId,
      approvalStatus: "approved",
      queueEnabled: true,
      token: superAdminToken(),
    });

    // THE PRECONDITION: the driver is free (no journey, no queue row anywhere),
    // so a check-in really puts them in THIS org's line. Assert it rather than
    // assume it — check-in answers "already in journey" with a 200 and no row,
    // which looks like success and then fails much later.
    const driverUserUniqueId = queueState.drivers[DRIVER_KEY].userUniqueId;
    if (!driverUserUniqueId) {
      throw new Error(`${DRIVER_KEY} was not provisioned — no userUniqueId`);
    }
    const [activeJourney] = await pool.query(
      `SELECT jd.journeyStatusId
         FROM JourneyDecisions jd
         JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
        WHERE dr.userUniqueId = ?
          AND dr.driverRequestDeletedAt IS NULL
          AND jd.journeyStatusId IN (2, 3, 4, 5, 6, 7, 8)
        LIMIT 1`,
      [driverUserUniqueId],
    );
    if (activeJourney.length > 0) {
      throw new Error(
        `${DRIVER_KEY} must start free, but holds journey status ${activeJourney[0].journeyStatusId}`,
      );
    }
    await resetDriverQueueDay(DRIVER_KEY);
    await resetDriverJourneyDay(DRIVER_KEY);
    await checkin(DRIVER_KEY, orgUniqueId);
    const before = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: DRIVER_KEY,
    });
    if (!before) {
      throw new Error("driver did not check in — no starting queue row");
    }
    if (before.status !== journeyStatusMap.waiting) {
      throw new Error(`driver should start WAITING(1), got status ${before.status}`);
    }
    report.pass("CAQ-01: driver checked in and WAITING with no job");

    // ── CAQ-02: company order → bid → offer accepted ─────────────────────
    const { shipperRequestBatchUniqueId: batchUniqueId } =
      await createCompanyTargetOrder({
        queueOrganizationUniqueId: orgUniqueId,
        vehicleTypeUniqueId,
      });
    createdBatchIds.push(batchUniqueId);

    // The queue org must ride on the batch header — that is what the linkage reads.
    const [[batch]] = await pool.query(
      `SELECT queueOrganizationUniqueId FROM ShipperRequestBatch WHERE batchUniqueId = ?`,
      [batchUniqueId],
    );
    if (batch.queueOrganizationUniqueId !== orgUniqueId) {
      throw new Error(
        `queue org did not persist on the batch header (got ${batch.queueOrganizationUniqueId})`,
      );
    }

    const bid = await submitCompanyBid(batchUniqueId);
    if (!bid?.companyBidRequestUniqueId) {
      throw new Error(`company bid not created: ${JSON.stringify(bid).slice(0, 300)}`);
    }
    await acceptCompanyOffer(bid.companyBidRequestUniqueId);

    // Accepting the offer mints the ShipperRequest rows for the batch.
    const [rows] = await pool.query(
      `SELECT shipperRequestUniqueId, journeyStatusId
         FROM ShipperRequest
        WHERE shipperRequestBatchUniqueId = ?
          AND shipperRequestDeletedAt IS NULL`,
      [batchUniqueId],
    );
    if (rows.length === 0) {
      throw new Error("accepting the company offer created no ShipperRequest row");
    }
    report.pass(
      `CAQ-02: company bid created + accepted (${rows.length} ShipperRequest row(s) minted)`,
    );

    // ── CAQ-03: company assigns the queued driver ────────────────────────
    const assignment = await createAssignment({
      companyBidRequestUniqueId: bid.companyBidRequestUniqueId,
    });
    if (!assignment?.assignmentUniqueId) {
      throw new Error(`assignment not created: ${JSON.stringify(assignment).slice(0, 300)}`);
    }
    createdAssignmentIds.push(assignment.assignmentUniqueId);

    const [[assigned]] = await pool.query(
      `SELECT cba.shipperRequestUniqueId, cba.assignmentStatus, cba.driverUserUniqueId
         FROM CompanyBidVehicleAssignment cba
        WHERE cba.assignmentUniqueId = ?`,
      [assignment.assignmentUniqueId],
    );
    if (!assigned?.shipperRequestUniqueId) {
      throw new Error("assignment did not claim a ShipperRequest slot");
    }

    // Still no job held → the queue row must be untouched at this point.
    const midway = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: DRIVER_KEY,
    });
    if (midway.status !== journeyStatusMap.waiting) {
      throw new Error(
        `queue row must stay WAITING(1) until the driver confirms, got ${midway.status}`,
      );
    }
    if (midway.shipperRequestUniqueId) {
      throw new Error("queue row must not carry an order before the driver confirms");
    }
    report.pass("CAQ-03: assignment created; queue row untouched until the driver confirms");

    // ── CAQ-04: driver confirms → the yard must know about the job ───────
    await confirmAssignment(assignment.assignmentUniqueId);

    const after = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: DRIVER_KEY,
    });
    if (after.status !== journeyStatusMap.acceptedByDriver) {
      throw new Error(
        `CAQ-04: queue row should be AGREED(3) after the driver confirms, got ${after.status}`,
      );
    }
    if (after.shipperRequestUniqueId !== assigned.shipperRequestUniqueId) {
      throw new Error(
        `CAQ-04: queue row carries the wrong order (${after.shipperRequestUniqueId})`,
      );
    }
    if (after.loadingOrderNumber === null || after.loadingOrderNumber === undefined) {
      throw new Error(
        "CAQ-04: queue row has no loadingOrderNumber — the yard cannot number this truck",
      );
    }
    report.pass(
      `CAQ-04: driver confirmed → queue row linked (agreed, loadingOrderNumber=${after.loadingOrderNumber})`,
    );

    // ── CAQ-05: the FIFO position was REUSED, not replaced ───────────────
    if (after.queueUniqueId !== before.queueUniqueId) {
      throw new Error(
        `CAQ-05: a new queue row was created (${before.queueUniqueId} → ${after.queueUniqueId}); the driver's FIFO position must be reused`,
      );
    }
    const allEntries = await liveEntriesFor(DRIVER_KEY);
    if (allEntries.length !== 1) {
      throw new Error(
        `CAQ-05: expected exactly 1 live queue row for the driver, found ${allEntries.length}`,
      );
    }
    report.pass("CAQ-05: existing FIFO row reused (same queueUniqueId, no second row)");

    // ── CAQ-06: no double booking — the same driver cannot take a 2nd job ─
    const { shipperRequestBatchUniqueId: secondBatchUniqueId } =
      await createCompanyTargetOrder({
        queueOrganizationUniqueId: orgUniqueId,
        vehicleTypeUniqueId,
      });
    createdBatchIds.push(secondBatchUniqueId);
    const secondBid = await submitCompanyBid(secondBatchUniqueId);
    await acceptCompanyOffer(secondBid.companyBidRequestUniqueId);

    await expectStatus(
      axios.post(
        backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.CREATE_ASSIGNMENT,
        {
          companyBidRequestUniqueId: secondBid.companyBidRequestUniqueId,
          vehicleUniqueId: queueState.drivers[DRIVER_KEY].vehicleUniqueId,
          driverUserUniqueId: queueState.drivers[DRIVER_KEY].userUniqueId,
        },
        authConfig(companyToken()),
      ),
      409,
      "CAQ-06 double-booking",
    );
    // And the queue still shows exactly one row — the refused assignment created
    // nothing.
    const afterRefusal = await liveEntriesFor(DRIVER_KEY);
    if (afterRefusal.length !== 1) {
      throw new Error(
        `CAQ-06: refused double booking still produced ${afterRefusal.length} queue rows`,
      );
    }
    report.pass("CAQ-06: driver already on a job cannot be assigned a second one (409)");
  } catch (error) {
    report.fail(`CAQ: company-assignment queue enrollment — ${dbError(error)}`, error);
  } finally {
    // Release the driver's journey so the row does not leak into other suites.
    for (const assignmentUniqueId of createdAssignmentIds) {
      try {
        await pool.query(
          `UPDATE CompanyBidVehicleAssignment
              SET assignmentStatus = 'cancelled_by_company', assignmentDeletedAt = NOW()
            WHERE assignmentUniqueId = ?`,
          [assignmentUniqueId],
        );
      } catch (error) {
        console.log(`  ⚠ CAQ cleanup (assignment) skipped: ${dbError(error)}`);
      }
    }
    for (const batchUniqueId of createdBatchIds) {
      if (!batchUniqueId) continue;
      try {
        await pool.query(
          `UPDATE ShipperRequest SET shipperRequestDeletedAt = NOW()
            WHERE shipperRequestBatchUniqueId = ?`,
          [batchUniqueId],
        );
        await pool.query(
          `UPDATE ShipperRequestBatch SET batchDeletedAt = NOW() WHERE batchUniqueId = ?`,
          [batchUniqueId],
        );
      } catch (error) {
        console.log(`  ⚠ CAQ cleanup (batch) skipped: ${dbError(error)}`);
      }
    }
    if (orgUniqueId) {
      try {
        await deleteQueueOrganization(orgUniqueId);
        console.log("  ✅ CAQ throwaway org cleaned up");
      } catch (error) {
        console.log(`  ⚠ CAQ cleanup (delete org) skipped: ${dbError(error)}`);
      }
    }
  }
};

module.exports = { runCompanyAssignmentQueueTests };

if (require.main === module) {
  (async () => {
    try {
      await runCompanyAssignmentQueueTests();
      process.exit(report.summary() ? 0 : 1);
    } catch (error) {
      console.error("FATAL:", error?.message || error);
      process.exit(1);
    }
  })();
}