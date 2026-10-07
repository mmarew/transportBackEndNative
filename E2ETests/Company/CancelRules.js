"use strict";

/**
 * E2E — Company-target cancellation business rules (TQ-42)
 *
 * R1. Driver cancels a company-target job → the slot survives (stays at
 *     acceptedByShipper=4) so the company can reassign another driver.
 * R2. Company cancels its bid → the request returns to waiting: BOTH the
 *     batch header and the slots go back to status 1 so other companies can
 *     bid again. (Regression: previously only the slots reverted and the
 *     batch header stayed at 4 — a phantom "ongoing" batch.)
 * R3. Only the shipper cancelling the batch may kill it → slots go terminal.
 *
 * Runs inside the full suite AFTER runCompanyFlow, so the core users and the
 * companyAdmin's company already exist.
 */
const axios = require("axios");
const { backendURL, usersData, usersRoles, cancellationReasonsType } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { expectGuardRejection, expectSuccess } = require("../Expect");
const { pool } = require("../../Middleware/Database.config.js");
const {
  COMPANY_ASSIGNMENT_ENDPOINTS,
} = require("../../Routes/EndPoints/companyAssignment.endpoints");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const { isActiveAssignment } = require("../../Services/CompanyAssignment/assignmentHelper/recall.service");
const { testUpdateAssignmentStatus } = require("./DriversAssignment");

const TERMINAL_IDS = new Set([10, 11, 12, 13, 15]);

const getSlotRows = (batchUniqueId) =>
  pool.query(
    `SELECT journeyStatusId, COUNT(*) AS cnt
     FROM ShipperRequest
     WHERE shipperRequestBatchUniqueId = ? AND shipperRequestDeletedAt IS NULL
     GROUP BY journeyStatusId`,
    [batchUniqueId],
  ).then(([rows]) => rows);

const getBatchRow = (batchUniqueId) =>
  pool.query(
    `SELECT journeyStatusId FROM ShipperRequestBatch WHERE batchUniqueId = ?`,
    [batchUniqueId],
  ).then(([rows]) => rows);

const createCompanyBatch = async (companyUniqueId, numberOfVehicles = 2) => {
  const { shipper } = usersData;
  const vtRes = await axios.get(
    backendURL + "/api/admin/vehicleTypes",
    authConfig(shipper.token),
  );
  const vehicleTypeUniqueId = vtRes.data.data[0].vehicleTypeUniqueId;
  const batchUniqueId = require("uuid").v4();
  await axios.post(
    backendURL + "/api/shipperRequest/createRequest",
    {
      shipperRequestBatchUniqueId: batchUniqueId,
      numberOfVehicles,
      shippingDate: "2026-09-01T10:00:00.000Z",
      deliveryDate: "2026-09-05T10:00:00.000Z",
      shippingCost: 500000,
      shippableItemQtyInQuintal: 100,
      shippableItemName: "Cancel Rule Test Cargo",
      requestMode: "company_target",
      targetCompanyUniqueId: companyUniqueId,
      originLocation: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa" },
      destination: { latitude: 11.13, longitude: 39.63, description: "Dessie" },
      vehicle: { vehicleTypeUniqueId },
    },
    authConfig(shipper.token),
  );
  return batchUniqueId;
};

const submitBid = async (companyUniqueId, batchUniqueId) => {
  const res = await axios.post(
    backendURL + "/api/company/bids",
    {
      shipperRequestBatchUniqueId: batchUniqueId,
      companyUniqueId,
      proposedCostPerVehicle: "90000",
    },
    authConfig(usersData.companyAdmin.token),
  );
  return res.data?.data?.companyBidRequestUniqueId;
};

const setBidStatus = async (bidUniqueId, bidStatus, token) => {
  const res = await axios.patch(
    backendURL + "/api/company/bids/" + bidUniqueId + "/status",
    { bidStatus },
    authConfig(token),
  );
  return res.data?.message !== "error";
};

const runCancelRulesTests = async () => {
  const { shipper, companyAdmin } = usersData;
  if (!shipper?.token || !companyAdmin?.token) {
    report.skip(
      "cancelRules",
      "shipper/companyAdmin tokens missing — run full suite",
    );
    return;
  }
  const companyUniqueId = companyAdmin.companies?.[0]?.companyUniqueId;
  if (!companyUniqueId) {
    report.skip("cancelRules", "no company created for companyAdmin");
    return;
  }

  try {
    // ── A) Company cancels an ACCEPTED bid → batch + slots return to waiting ──
    const batchA = await createCompanyBatch(companyUniqueId);
    report.pass("cancelRules: batchCreated");

    const bidA = await submitBid(companyUniqueId, batchA);
    if (!bidA) throw new Error("bid submission failed");
    report.pass("cancelRules: bidSubmitted");

    if (!(await setBidStatus(bidA, "accepted_by_shipper", shipper.token))) {
      throw new Error("bid acceptance failed");
    }
    report.pass("cancelRules: bidAccepted");

    let batchRow = await getBatchRow(batchA);
    let slots = await getSlotRows(batchA);
    if (Number(batchRow[0]?.journeyStatusId) !== 4) {
      throw new Error(`batch header expected 4 after accept, got ${batchRow[0]?.journeyStatusId}`);
    }
    if (
      slots.length !== 1 ||
      Number(slots[0].journeyStatusId) !== 4 ||
      Number(slots[0].cnt) !== 2
    ) {
      throw new Error(`slots expected 2×status-4 after accept, got ${JSON.stringify(slots)}`);
    }
    report.pass("cancelRules: afterAccept batch=4 slots=4");

    if (!(await setBidStatus(bidA, "cancelled_by_company", companyAdmin.token))) {
      throw new Error("company bid cancellation failed");
    }
    report.pass("cancelRules: companyCancelledAcceptedBid");

    batchRow = await getBatchRow(batchA);
    slots = await getSlotRows(batchA);
    if (Number(batchRow[0]?.journeyStatusId) !== 1) {
      throw new Error(`batch header expected 1 after company cancel, got ${batchRow[0]?.journeyStatusId}`);
    }
    if (
      slots.length !== 1 ||
      Number(slots[0].journeyStatusId) !== 1 ||
      Number(slots[0].cnt) !== 2
    ) {
      throw new Error(`slots expected 2×status-1 after company cancel, got ${JSON.stringify(slots)}`);
    }
    report.pass("cancelRules: afterCompanyCancel batch=1 slots=1");

    // ── B) Shipper cancels the batch → slots terminal (only shipper can kill) ──
    const batchB = await createCompanyBatch(companyUniqueId);
    const bidB = await submitBid(companyUniqueId, batchB);
    if (!bidB || !(await setBidStatus(bidB, "accepted_by_shipper", shipper.token))) {
      throw new Error("batch B accept failed");
    }

    const cancelRes = await axios.put(
      backendURL + "/api/shipperRequestBatch/" + batchB + "/cancel",
      { cancellationReasonsTypeId: 3 },
      authConfig(shipper.token),
    );
    if (cancelRes.data?.message === "error") {
      throw new Error(JSON.stringify(cancelRes.data).slice(0, 300));
    }
    report.pass("cancelRules: shipperCancelledBatch");

    const batchBRow = await getBatchRow(batchB);
    const slotsB = await getSlotRows(batchB);
    if (!TERMINAL_IDS.has(Number(batchBRow[0]?.journeyStatusId))) {
      throw new Error(`batch header expected terminal after shipper cancel, got ${batchBRow[0]?.journeyStatusId}`);
    }
    if (
      slotsB.length === 0 ||
      !slotsB.every((r) => TERMINAL_IDS.has(Number(r.journeyStatusId)))
    ) {
      throw new Error(`slots expected terminal after shipper cancel, got ${JSON.stringify(slotsB)}`);
    }
    report.pass("cancelRules: afterShipperCancel slotsTerminal");
  } catch (error) {
    report.fail("cancelRules", error);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// P6 — Driver replacement flow (docs/driver-replacement-plan.md)
//
// R1  Driver cancels POST-confirm → slot survives at acceptedByShipper(4),
//     assignment row becomes cancelled_by_driver, truck pulled to inactive (P4).
// R2  Replace: old row cancelled_by_company, new row 'reassigned' (D3), old
//     truck pulled (D4), replaced driver freed, slot untouched.
// R3  D5 manual re-free via PATCH /api/company/fleet/:companyVehicleUniqueId.
// G   Gates: role 403 (D7), terminal row 409 (D1), inactive vehicle 409 (D6).
// ─────────────────────────────────────────────────────────────────────────────

const replaceUrl = (assignmentUniqueId) =>
  backendURL +
  COMPANY_ASSIGNMENT_ENDPOINTS.REPLACE_ASSIGNMENT.replace(
    ":assignmentUniqueId",
    assignmentUniqueId,
  );

const getSlotForBatch = (batchUniqueId) =>
  pool
    .query(
      `SELECT shipperRequestUniqueId, journeyStatusId
         FROM ShipperRequest
        WHERE shipperRequestBatchUniqueId = ? AND shipperRequestDeletedAt IS NULL
        ORDER BY shipperRequestId LIMIT 1`,
      [batchUniqueId],
    )
    .then(([rows]) => rows[0]);

const getAssignmentRow = (assignmentUniqueId) =>
  pool
    .query(
      `SELECT assignmentUniqueId, assignmentStatus, driverUserUniqueId, vehicleUniqueId
         FROM CompanyBidVehicleAssignment WHERE assignmentUniqueId = ?`,
      [assignmentUniqueId],
    )
    .then(([rows]) => rows[0]);

const getFleetRow = (companyUniqueId, vehicleUniqueId) =>
  pool
    .query(
      `SELECT companyVehicleUniqueId, assignmentStatus
         FROM CompanyVehicle
        WHERE companyUniqueId = ? AND vehicleUniqueId = ? AND companyVehicleDeletedAt IS NULL`,
      [companyUniqueId, vehicleUniqueId],
    )
    .then(([rows]) => rows[0]);

const resolveUserUniqueIdByPhone = async (phoneNumber) => {
  const [rows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE phoneNumber = ? LIMIT 1`,
    [phoneNumber],
  );
  return rows[0]?.userUniqueId || null;
};

const countActiveAssignmentsForDriver = async (driverUserUniqueId) => {
  const [rows] = await pool.query(
    `SELECT assignmentStatus FROM CompanyBidVehicleAssignment
      WHERE driverUserUniqueId = ? AND assignmentDeletedAt IS NULL`,
    [driverUserUniqueId],
  );
  return rows.filter((r) => isActiveAssignment(r.assignmentStatus)).length;
};

const ensureVehicleActive = async (companyUniqueId, vehicleUniqueId, token) => {
  const row = await getFleetRow(companyUniqueId, vehicleUniqueId);
  if (!row) throw new Error(`truck ${vehicleUniqueId} is not in the company fleet`);
  if (row.assignmentStatus !== "active") {
    await axios.patch(
      backendURL + "/api/company/fleet/" + row.companyVehicleUniqueId,
      { assignmentStatus: "active" },
      authConfig(token),
    );
    const again = await getFleetRow(companyUniqueId, vehicleUniqueId);
    if (again.assignmentStatus !== "active") {
      throw new Error("fleet PATCH did not re-free the truck (D5)");
    }
  }
};

/** Recall anything the driver still holds (self-healing precondition), then re-free the truck. */
const ensureDriverAndTruckFree = async (companyUniqueId, driverUserUniqueId, vehicleUniqueId, token) => {
  const [live] = await pool.query(
    `SELECT assignmentUniqueId, assignmentStatus FROM CompanyBidVehicleAssignment
      WHERE driverUserUniqueId = ? AND assignmentDeletedAt IS NULL`,
    [driverUserUniqueId],
  );
  for (const row of live) {
    if (!isActiveAssignment(row.assignmentStatus)) continue;
    await axios.delete(
      backendURL +
        COMPANY_ASSIGNMENT_ENDPOINTS.DELETE_ASSIGNMENT.replace(
          ":assignmentUniqueId",
          row.assignmentUniqueId,
        ),
      authConfig(token),
    );
  }
  await ensureVehicleActive(companyUniqueId, vehicleUniqueId, token);
};

/** Second truck for the replace step: clone the driver's vehicle row into our fleet. */
const cloneTruckIntoFleet = async (companyUniqueId, sourceVehicleUniqueId, createdBy) => {
  const [src] = await pool.query(
    `SELECT vehicleTypeUniqueId, licensePlate, color FROM Vehicle WHERE vehicleUniqueId = ?`,
    [sourceVehicleUniqueId],
  );
  if (!src[0]) throw new Error("source vehicle not found for clone");
  const { v4: uuidv4 } = require("uuid");
  const truckUniqueId = uuidv4();
  const fleetRowUniqueId = uuidv4();
  const licensePlate = `${src[0].licensePlate}-R${String(Date.now() % 100000)}`.slice(0, 50);
  await pool.query(
    `INSERT INTO Vehicle (vehicleUniqueId, vehicleTypeUniqueId, licensePlate, color, vehicleCreatedBy, vehicleCreatedAt)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [truckUniqueId, src[0].vehicleTypeUniqueId, licensePlate, src[0].color, createdBy],
  );
  await pool.query(
    `INSERT INTO CompanyVehicle (companyVehicleUniqueId, companyUniqueId, vehicleUniqueId, assignmentStatus, assignmentStartDate, companyVehicleCreatedAt, companyVehicleCreatedBy)
     VALUES (?, ?, ?, 'active', NOW(), NOW(), ?)`,
    [fleetRowUniqueId, companyUniqueId, truckUniqueId, createdBy],
  );
  return truckUniqueId;
};

const runReplacementFlowTests = async () => {
  console.log("\n── Driver Replacement Flow (P6) ──");
  const { shipper, companyAdmin, driver } = usersData;
  if (!shipper?.token || !companyAdmin?.token || !driver?.token) {
    report.skip("replacementFlow", "shipper/companyAdmin/driver tokens missing — run full suite");
    console.log("── Driver Replacement Flow complete ──\n");
    return;
  }
  const companyUniqueId = companyAdmin.companies?.[0]?.companyUniqueId;
  const driverUserUniqueId = driver?.accountData?.userData?.userUniqueId;
  const vehicleUniqueId = driver?.accountData?.vehicle?.vehicleUniqueId;
  const replacementDriver = await resolveUserUniqueIdByPhone(companyAdmin.phoneNumber);
  if (!companyUniqueId || !driverUserUniqueId || !vehicleUniqueId || !replacementDriver) {
    report.skip(
      "replacementFlow",
      `precondition not met (company=${Boolean(companyUniqueId)}, driver=${Boolean(driverUserUniqueId)}, truck=${Boolean(vehicleUniqueId)}, replacementDriver=${Boolean(replacementDriver)})`,
    );
    console.log("── Driver Replacement Flow complete ──\n");
    return;
  }
  const token = companyAdmin.token;

  try {
    // 0. Self-sufficient precondition: driver free, truck active in our fleet.
    await ensureDriverAndTruckFree(companyUniqueId, driverUserUniqueId, vehicleUniqueId, token);
    report.pass("replacement: precondition — driver free, truck active (D5 re-free)");

    // 1. One-slot company_target batch → bid → shipper accepts.
    const batchUniqueId = await createCompanyBatch(companyUniqueId, 1);
    const bidUniqueId = await submitBid(companyUniqueId, batchUniqueId);
    if (!bidUniqueId) throw new Error("bid submission failed");
    if (!(await setBidStatus(bidUniqueId, "accepted_by_shipper", shipper.token))) {
      throw new Error("bid acceptance failed");
    }
    const slot = await getSlotForBatch(batchUniqueId);
    if (!slot || Number(slot.journeyStatusId) !== 4) {
      throw new Error(`slot should be acceptedByShipper(4) after accept, got ${slot?.journeyStatusId}`);
    }
    report.pass("replacement: one-slot batch accepted (slot at 4)");

    // 2. Assignment A1 → confirm (post-confirm baseline for R1).
    const a1Res = await expectSuccess({
      label: "replacement: A1 created on accepted bid",
      run: () =>
        axios.post(
          backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.CREATE_ASSIGNMENT,
          { companyBidRequestUniqueId: bidUniqueId, vehicleUniqueId, driverUserUniqueId },
          authConfig(token),
        ),
    });
    const a1 = a1Res.data.data;
    await testUpdateAssignmentStatus({
      userType: "companyAdmin",
      assignmentUniqueId: a1.assignmentUniqueId,
      assignmentStatus: "confirmed_by_driver",
    });
    report.pass("replacement: A1 confirmed_by_driver");

    // 3. R1 — driver backs out AFTER confirm.
    await axios.put(
      backendURL +
        DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
        `?ownerUserUniqueId=self&roleId=${usersRoles.driverRoleId}&cancellationReasonsTypeId=${cancellationReasonsType.driverCancel}`,
      {},
      authConfig(driver.token),
    );
    const slotAfterCancel = await getSlotForBatch(batchUniqueId);
    if (Number(slotAfterCancel.journeyStatusId) !== 4) {
      throw new Error(`R1: slot must survive at 4 after driver cancel, got ${slotAfterCancel.journeyStatusId}`);
    }
    const a1Row = await getAssignmentRow(a1.assignmentUniqueId);
    if (a1Row.assignmentStatus !== "cancelled_by_driver") {
      throw new Error(`A1 expected cancelled_by_driver, got ${a1Row.assignmentStatus}`);
    }
    const truckRow = await getFleetRow(companyUniqueId, vehicleUniqueId);
    if (truckRow.assignmentStatus !== "inactive") {
      throw new Error(`truck must be pulled to inactive after post-confirm driver cancel, got ${truckRow.assignmentStatus}`);
    }
    report.pass("replacement R1: driver cancel → slot stays 4, row cancelled_by_driver, truck pulled (P4)");

    // 4. Gates against the terminal row + wrong role.
    await expectGuardRejection({
      label: "replacement gate: replace on terminal assignment → 409 (D1)",
      allowed: [409],
      run: () =>
        axios.post(
          replaceUrl(a1.assignmentUniqueId),
          { vehicleUniqueId, driverUserUniqueId },
          authConfig(token),
        ),
    });
    await expectGuardRejection({
      label: "replacement gate: driver token cannot replace → 403 (D7)",
      allowed: [403],
      run: () =>
        axios.post(
          replaceUrl(a1.assignmentUniqueId),
          { vehicleUniqueId, driverUserUniqueId },
          authConfig(driver.token),
        ),
    });

    // 5. D5 re-free → slot is reclaimable.
    await ensureVehicleActive(companyUniqueId, vehicleUniqueId, token);
    report.pass("replacement D5: dispatcher re-frees truck via PATCH /api/company/fleet");
    const a2Res = await expectSuccess({
      label: "replacement: A2 created — slot reclaimable after driver cancel",
      run: () =>
        axios.post(
          backendURL + COMPANY_ASSIGNMENT_ENDPOINTS.CREATE_ASSIGNMENT,
          { companyBidRequestUniqueId: bidUniqueId, vehicleUniqueId, driverUserUniqueId },
          authConfig(token),
        ),
    });
    const a2 = a2Res.data.data;

    // 6. Replace A2 → clone truck + second driver.
    const cloneVehicleUniqueId = await cloneTruckIntoFleet(companyUniqueId, vehicleUniqueId, replacementDriver);
    const replaceRes = await expectSuccess({
      label: "replacement: replace A2 → HTTP 201 reassigned row",
      allowed: [200, 201],
      run: () =>
        axios.post(
          replaceUrl(a2.assignmentUniqueId),
          { vehicleUniqueId: cloneVehicleUniqueId, driverUserUniqueId: replacementDriver },
          authConfig(token),
        ),
    });
    const newAssignmentUniqueId = replaceRes.data?.data?.assignmentUniqueId;
    if (!newAssignmentUniqueId) throw new Error("replace response missing assignmentUniqueId");

    const a2Row = await getAssignmentRow(a2.assignmentUniqueId);
    if (a2Row.assignmentStatus !== "cancelled_by_company") {
      throw new Error(`A2 expected cancelled_by_company, got ${a2Row.assignmentStatus}`);
    }
    const newRow = await getAssignmentRow(newAssignmentUniqueId);
    if (newRow.assignmentStatus !== "reassigned") {
      throw new Error(`new row expected reassigned, got ${newRow.assignmentStatus}`);
    }
    if (newRow.driverUserUniqueId !== replacementDriver || newRow.vehicleUniqueId !== cloneVehicleUniqueId) {
      throw new Error("new row must hold the replacement driver + clone truck");
    }
    const oldTruckRow = await getFleetRow(companyUniqueId, vehicleUniqueId);
    if (oldTruckRow.assignmentStatus !== "inactive") {
      throw new Error(`old truck must be inactive after replace (D4), got ${oldTruckRow.assignmentStatus}`);
    }
    const cloneFleetRow = await getFleetRow(companyUniqueId, cloneVehicleUniqueId);
    if (cloneFleetRow.assignmentStatus !== "active") {
      throw new Error("clone truck must stay active after replace");
    }
    if ((await countActiveAssignmentsForDriver(driverUserUniqueId)) !== 0) {
      throw new Error("replaced driver must be freed after replace");
    }
    const slotFinal = await getSlotForBatch(batchUniqueId);
    if (Number(slotFinal.journeyStatusId) !== 4) {
      throw new Error(`slot must stay at 4 after replace, got ${slotFinal.journeyStatusId}`);
    }
    report.pass(
      "replacement: old row cancelled_by_company, new row reassigned, old truck pulled, driver freed, slot at 4",
    );

    // 7. Gate — inactive vehicle (old truck, now inactive) on a LIVE row.
    await expectGuardRejection({
      label: "replacement gate: inactive vehicle → 409 (D6)",
      allowed: [409],
      run: () =>
        axios.post(
          replaceUrl(newAssignmentUniqueId),
          { vehicleUniqueId, driverUserUniqueId },
          authConfig(token),
        ),
    });
  } catch (error) {
    report.fail("replacementFlow", error);
  }
  console.log("── Driver Replacement Flow complete ──\n");
};

module.exports = { runCancelRulesTests, runReplacementFlowTests };
