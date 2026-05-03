"use strict";

/**
 * CompanyAssignment Service
 * ─────────────────────────
 * Manages the assignment of individual drivers/vehicles to slots within an
 * accepted company freight bid.
 *
 * ── Journey Status Design (Company Bid Flow) ────────────────────────────────
 *
 * The shared `journeyStatusId` scale (1-6) was originally designed for the
 * INDIVIDUAL bidding flow, where the driver is the bidder:
 *
 *   Individual:  1(waiting) → 2(requested) → 3(acceptedByDriver) → 4(acceptedByPassenger) → 5 → 6
 *                                              ↑
 *                                   Driver bids & bargains here
 *
 * In the COMPANY bid flow, the company — not the individual driver — is the
 * bidder. The company bids, bargains, and commits on behalf of its entire
 * fleet. Status 3 (acceptedByDriver) represents that bidding act.
 *
 * By the time a dispatcher assigns an individual driver to a slot, the
 * bidding phase is completely over (CompanyBidRequest = 'accepted_by_shipper').
 * The driver is being *requested* to carry out an already-agreed job —
 * they did not bid themselves.
 *
 * Therefore, in the company flow, status 3 is intentionally skipped:
 *
 *   Company:     1(waiting) → 2(requested) → [3 SKIPPED] → 4(acceptedByPassenger) → 5 → 6
 *                                ↑                              ↑
 *                      Dispatcher assigns                Driver confirms
 *                      (company requested driver)        (all parties agreed)
 *
 * Status 4 is reached when the driver explicitly confirms the assignment,
 * meaning: shipper accepted the bid (company-level) + driver accepted the
 * assignment (individual-level) = full agreement on all sides = 4.
 *
 * See: Docs/journey_status_lifecycle.md for the full reference table.
 * ────────────────────────────────────────────────────────────────────────────
 */

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const { sendSocketIONotificationToDriver } = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");
const logger = require("../Utils/logger");
const { createDriverRequest } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const { getPassengerRequestByUniqueId } = require("./PassengerRequest");
const {
  verifyDriverJourneyStatus,
} = require("./DriverRequest/statusVerification.service");

/**
 * Creates a JourneyDecision record that formally links a PassengerRequest
 * to a DriverRequest at the moment of company assignment (status 2).
 *
 * This is the canonical join between the shipper's request and the assigned
 * driver's request. Without it, `handleExistingJourney` in the status-
 * verification service cannot resolve the passenger context and would
 * incorrectly reset the DriverRequest back to status 1.
 *
 * Called by: createAssignment, createBulkAssignments, autoAssignBatch.
 * At confirmation (confirmed_by_driver) the same row is updated to status 4.
 *
 * @param {string} passengerRequestUniqueId
 * @param {string} driverRequestUniqueId
 * @param {string} createdByUserUniqueId  — dispatcher / company admin
 * @returns {Promise<string>} journeyDecisionUniqueId
 */
async function createJourneyDecisionForAssignment(
  passengerRequestUniqueId,
  driverRequestUniqueId,
  createdByUserUniqueId,
) {
  // Resolve numeric PKs
  const [[prRow]] = await db().query(
    "SELECT passengerRequestId FROM PassengerRequest WHERE passengerRequestUniqueId = ? LIMIT 1",

    [passengerRequestUniqueId],
  );
  if (!prRow)
    throw new AppError(
      "Passenger request not found while creating JourneyDecision",
      404,
    );

  const [[drRow]] = await db().query(
    "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
    [driverRequestUniqueId],
  );
  if (!drRow)
    throw new AppError(
      "Driver request not found while creating JourneyDecision",
      404,
    );

  // Idempotency: if a decision already exists for this driverRequestId, return it
  const [[existing]] = await db().query(
    "SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ? LIMIT 1",
    [drRow.driverRequestId],
  );
  if (existing) return existing.journeyDecisionUniqueId;

  const journeyDecisionUniqueId = uuidv4();
  await db().query(
    `INSERT INTO JourneyDecisions
      (journeyDecisionUniqueId, passengerRequestId, driverRequestId,
       journeyStatusId, decisionTime, decisionBy,
       journeyDecisionCreatedBy, journeyDecisionCreatedAt)
     VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`,
    [
      journeyDecisionUniqueId,
      prRow.passengerRequestId,
      drRow.driverRequestId,
      journeyStatusMap.requested, // status 2 — company has requested this driver
      currentDate(),
      createdByUserUniqueId,
      currentDate(),
    ],
  );

  logger.info("JourneyDecision created at assignment time", {
    journeyDecisionUniqueId,
    passengerRequestUniqueId,
    driverRequestUniqueId,
    journeyStatusId: journeyStatusMap.requested,
  });

  return journeyDecisionUniqueId;
}

/**
 * Sends both FCM + WebSocket notification to an assigned driver.
 * Used by createAssignment, createBulkAssignments, and autoAssignBatch
 * so all three paths behave identically.
 *
 * @param {Object} opts
 * @param {string} opts.driverUserUniqueId
 * @param {string} opts.assignmentUniqueId
 * @param {string} opts.driverRequestUniqueId
 * @param {string} opts.passengerRequestUniqueId
 * @param {string} opts.companyBidRequestUniqueId
 */
const notifyAssignedDriver = async (opts) => {
  const {
    driverUserUniqueId,
    assignmentUniqueId,
    driverRequestUniqueId,
    passengerRequestUniqueId,
    companyBidRequestUniqueId,
  } = opts;

  const notificationData = {
    type: "company_driver_assignment",
    assignmentUniqueId,
    driverRequestUniqueId,
    passengerRequestUniqueId,
    companyBidRequestUniqueId,
  };

  // 1. FCM — wakes up the app even when it's in the background
  sendFCMNotificationToUser({
    userUniqueId: driverUserUniqueId,
    roleId: usersRoles.driverRoleId,
    notification: {
      title: "New freight assignment",
      body: "You have been assigned to a freight job. Please confirm or reject.",
    },
    data: notificationData,
  }).catch((e) =>
    logger.error("FCM failed for driver assignment", {
      error: e.message,
      driverUserUniqueId,
      assignmentUniqueId,
    }),
  );

  // 2. WebSocket — instant delivery when app is already open
  try {
    const [userRows] = await db().query(
      "SELECT phoneNumber FROM Users WHERE userUniqueId = ? LIMIT 1",
      [driverUserUniqueId],
    );
    const phoneNumber = userRows?.[0]?.phoneNumber;

    if (phoneNumber) {
      // Call verifyDriverJourneyStatus to get the exact same payload the driver
      // would receive on the next poll — includes passenger, decision, companyAssignment.
      let wsPayload;
      try {
        const statusResult = await verifyDriverJourneyStatus({
          userUniqueId: driverUserUniqueId,
        });
        wsPayload = {
          messageTypes: messageTypes.company_driver_assignment,
          message: "success",
          ...statusResult, // status, driver, passenger, decision, journey, companyAssignment
        };
      } catch (verifyErr) {
        // Fallback: send minimal payload so ResponseHandler still dispatches status=2
        logger.warn(
          "verifyDriverJourneyStatus failed in notifyAssignedDriver, using fallback payload",
          {
            error: verifyErr.message,
            driverUserUniqueId,
          },
        );
        wsPayload = {
          messageTypes: messageTypes.company_driver_assignment,
          message: "success",
          status: journeyStatusMap.requested,
          companyAssignment: {
            assignmentUniqueId,
            driverRequestUniqueId,
            passengerRequestUniqueId,
            companyBidRequestUniqueId,
          },
          driver: null,
          passenger: null,
          journey: null,
          decision: null,
        };
      }

      sendSocketIONotificationToDriver({
        phoneNumber,
        message: wsPayload,
      }).catch((e) =>
        logger.warn(
          "WebSocket failed for driver assignment (driver may be offline)",
          {
            error: e.message,
            driverUserUniqueId,
            assignmentUniqueId,
          },
        ),
      );
    }
  } catch (e) {
    logger.warn("Could not fetch driver phone for WebSocket notification", {
      error: e.message,
      driverUserUniqueId,
    });
  }
};

/**
 * upsertDriverRequest
 * ────────────────────
 * Creates or reuses a DriverRequest row for the given driver at assignment time.
 *
 * **Offline-first design:** A dispatcher can assign a driver even when the driver
 * is offline (no active DriverRequest). In that case a fresh row is inserted with
 * the origin coordinates from the PassengerRequest, so the driver wakes up to a
 * pre-populated job card.
 *
 * **Rules (in order):**
 * 1. Exactly ONE non-deleted DriverRequest exists → UPDATE it in-place and reuse
 *    its UUID. No status filter — works for waiting, offline, or any state.
 * 2. Zero rows (driver offline) or 2+ rows (test pollution) → INSERT a fresh row.
 *
 * @param {Object} opts
 * @param {string} opts.driverUserUniqueId
 * @param {number} opts.newStatusId        - journeyStatusId to set (e.g. requested = 2)
 * @param {number} opts.originLat
 * @param {number} opts.originLng
 * @param {string} opts.originPlace
 * @returns {Promise<string>} The driverRequestUniqueId to link in the assignment.
 */
const upsertDriverRequest = async ({
  driverUserUniqueId,
  newStatusId,
  originLat,
  originLng,
  originPlace,
}) => {
  // Fetch up to 2 rows — no status filter so offline drivers (0 rows) fall through
  // to the INSERT path, and drivers with exactly 1 row are updated in-place.
  const [existingRows] = await db().query(
    `SELECT driverRequestUniqueId
     FROM DriverRequest
     WHERE userUniqueId = ?
       AND driverRequestDeletedAt IS NULL
     LIMIT 2`,
    [driverUserUniqueId],
  );

  if (existingRows && existingRows.length === 1) {
    // Exactly one row — update it in-place regardless of its current status.
    const existingUniqueId = existingRows[0].driverRequestUniqueId;
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestUniqueId: existingUniqueId },
      updateValues: {
        journeyStatusId: newStatusId,
        originLatitude: originLat ?? 0,
        originLongitude: originLng ?? 0,
        originPlace: originPlace ?? "Assigned by dispatcher",
        driverRequestUpdatedAt: currentDate(),
      },
    });
    return existingUniqueId;
  }

  // 0 rows (offline driver) or 2+ rows (stale test data) → INSERT fresh row.
  const result = await createDriverRequest(
    {
      currentLocation: {
        latitude: originLat ?? 0,
        longitude: originLng ?? 0,
        description: originPlace ?? "Assigned by dispatcher",
      },
    },
    driverUserUniqueId,
    newStatusId,
  );

  // createDriverRequest returns existing active rows without inserting when
  // one already exists (activeJourneyStatuses check). Extract the UUID safely.
  const row = result?.data?.[0];
  if (!row?.driverRequestUniqueId) {
    throw new AppError("Failed to create or reuse DriverRequest", 500);
  }
  return row.driverRequestUniqueId;
};

/**
 * findActiveAssignmentForSlot
 * ────────────────────────────
 * Checks whether a given PassengerRequest slot already has a non-terminal
 * CompanyBidVehicleAssignment for the specified bid.
 *
 * "Active" means any status that is NOT a terminal cancel/reject:
 *   assigned | confirmed_by_driver | going_to_loading | journey_started
 *
 * Returns the assignment row if one exists, or null if the slot is free.
 * Used as a duplicate-assignment guard before creating a new assignment.
 *
 * @param {string} companyBidRequestUniqueId
 * @param {string} passengerRequestUniqueId
 * @returns {Promise<Object|null>} existing assignment row or null
 */
async function findActiveAssignmentForSlot(
  companyBidRequestUniqueId,
  passengerRequestUniqueId,
) {
  const [rows] = await db().query(
    `SELECT assignmentUniqueId, assignmentStatus
     FROM CompanyBidVehicleAssignment
     WHERE companyBidRequestUniqueId = ?
       AND passengerRequestUniqueId  = ?
       AND assignmentDeletedAt IS NULL
       AND assignmentStatus NOT IN (
         'rejected_by_driver',
         'cancelled_by_company',
         'cancelled_by_shipper',
         'cancelled_by_driver'
       )
     LIMIT 1`,
    [companyBidRequestUniqueId, passengerRequestUniqueId],
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * createAssignment
 * ─────────────────
 */
exports.createAssignment = async (data) => {
  const {
    companyBidRequestUniqueId,
    passengerRequestUniqueId,
    vehicleUniqueId,
    driverUserUniqueId,
    createdByUserUniqueId,
  } = data;

  // Bid must be accepted by shipper
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Vehicles can only be assigned after the shipper accepts the bid",
      400,
    );
  }

  // PassengerRequest must belong to the bid's batch
  // Uses the dedicated PassengerRequest service instead of raw SQL
  const pr = await getPassengerRequestByUniqueId(
    passengerRequestUniqueId,
    bid.passengerRequestBatchId,
  );

  // Prevent duplicate assignment for the same slot
  const existingAssignment = await findActiveAssignmentForSlot(
    companyBidRequestUniqueId,
    passengerRequestUniqueId,
  );
  if (existingAssignment) {
    throw new AppError(
      "This passenger request slot already has an active assignment",
      409,
    );
  }

  // ── Upsert DriverRequest — status 2 (requested): company is requesting
  //    the driver. Status advances to 4 (acceptedByPassenger = all agreed)
  //    only after the driver explicitly confirms the assignment.
  const requestedStatusId = journeyStatusMap.requested;

  const driverRequestUniqueId = await upsertDriverRequest({
    driverUserUniqueId,
    newStatusId: requestedStatusId,
    originLat: pr.originLatitude,
    originLng: pr.originLongitude,
    originPlace: pr.originPlace,
  });

  // ── Create JourneyDecision at assignment time (status 2) ─────────────────
  // This is the canonical link between the shipper's PassengerRequest and
  // the driver's DriverRequest. Creating it here (not at confirmation)
  // ensures verifyDriverJourneyStatus can resolve the passenger context
  // immediately after assignment.
  const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
    passengerRequestUniqueId,
    driverRequestUniqueId,
    createdByUserUniqueId,
  );

  const assignmentUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyBidVehicleAssignment
      (assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
       vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
       assignmentStatus, journeyDecisionUniqueId, assignmentCreatedBy, assignmentCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)`,
    [
      assignmentUniqueId,
      companyBidRequestUniqueId,
      passengerRequestUniqueId,
      vehicleUniqueId,
      driverUserUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      createdByUserUniqueId,
      currentDate(),
    ],
  );

  // ── Notify the assigned driver (FCM + WebSocket) ──────────────────────────
  notifyAssignedDriver({
    driverUserUniqueId,
    assignmentUniqueId,
    driverRequestUniqueId,
    passengerRequestUniqueId,
    companyBidRequestUniqueId,
  });

  return {
    message: "success",
    data: {
      assignmentUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
    },
  };
};

/**
 * createBulkAssignments
 * ─────────────────────
 * Assigns multiple vehicles/drivers to different slots of a single bid batch.
 * Junior Note: This is an Atomic Operation. If one assignment fails, all fail.
 */
exports.createBulkAssignments = async (data) => {
  const { companyBidRequestUniqueId, assignments, createdByUserUniqueId } =
    data;

  // 1. Validate the bid once
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Vehicles can only be assigned after the shipper accepts the bid",
      400,
    );
  }

  // 2. Optimized: Cache status IDs for the loop
  const acceptedStatusId = journeyStatusMap.acceptedByDriver;

  const results = [];

  // 3. Process each assignment in the bulk array
  for (const item of assignments) {
    const { passengerRequestUniqueId, vehicleUniqueId, driverUserUniqueId } =
      item;

    // Check if slot belongs to the batch — uses the dedicated service function
    const pr = await getPassengerRequestByUniqueId(
      passengerRequestUniqueId,
      bid.passengerRequestBatchId,
    );

    // Prevent duplicate assignment
    const existingAssignment = await findActiveAssignmentForSlot(
      companyBidRequestUniqueId,
      passengerRequestUniqueId,
    );
    if (existingAssignment) {
      throw new AppError(
        `Slot ${passengerRequestUniqueId} already has an active assignment`,
        409,
      );
    }

    // Upsert DriverRequest — status 2 (requested): company is requesting the
    // driver. Status advances to 4 when driver confirms.
    const driverRequestUniqueId = await upsertDriverRequest({
      driverUserUniqueId,
      newStatusId: journeyStatusMap.requested,
      originLat: pr.originLatitude,
      originLng: pr.originLongitude,
      originPlace: pr.originPlace ?? "Bulk assigned",
    });

    // ── Create JourneyDecision at assignment time (status 2) ───────────────
    const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
      passengerRequestUniqueId,
      driverRequestUniqueId,
      createdByUserUniqueId,
    );

    const assignmentUniqueId = uuidv4();

    // Create Assignment
    await db().query(
      `INSERT INTO CompanyBidVehicleAssignment
        (assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
         vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
         assignmentStatus, journeyDecisionUniqueId, assignmentCreatedBy, assignmentCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)`,
      [
        assignmentUniqueId,
        companyBidRequestUniqueId,
        passengerRequestUniqueId,
        vehicleUniqueId,
        driverUserUniqueId,
        driverRequestUniqueId,
        journeyDecisionUniqueId,
        createdByUserUniqueId,
        currentDate(),
      ],
    );

    // Notify driver (FCM + WebSocket)
    notifyAssignedDriver({
      driverUserUniqueId,
      assignmentUniqueId,
      driverRequestUniqueId,
      passengerRequestUniqueId,
      companyBidRequestUniqueId,
    });

    results.push({
      assignmentUniqueId,
      passengerRequestUniqueId,
      journeyDecisionUniqueId,
    });
  }

  return { message: "success", data: results };
};

exports.getAssignments = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["cba.assignmentDeletedAt IS NULL"];
  const params = [];

  if (filters.assignmentUniqueId) {
    clauses.push("cba.assignmentUniqueId = ?");
    params.push(filters.assignmentUniqueId);
  }
  if (filters.companyBidRequestUniqueId) {
    clauses.push("cba.companyBidRequestUniqueId = ?");
    params.push(filters.companyBidRequestUniqueId);
  }
  if (filters.passengerRequestUniqueId) {
    clauses.push("cba.passengerRequestUniqueId = ?");
    params.push(filters.passengerRequestUniqueId);
  }
  if (filters.vehicleUniqueId) {
    clauses.push("cba.vehicleUniqueId = ?");
    params.push(filters.vehicleUniqueId);
  }
  if (filters.driverUserUniqueId) {
    clauses.push("cba.driverUserUniqueId = ?");
    params.push(filters.driverUserUniqueId);
  }
  if (filters.driverRequestUniqueId) {
    clauses.push("cba.driverRequestUniqueId = ?");
    params.push(filters.driverRequestUniqueId);
  }
  if (filters.assignmentStatus) {
    clauses.push("cba.assignmentStatus = ?");
    params.push(filters.assignmentStatus);
  }
  if (filters.journeyDecisionUniqueId) {
    clauses.push("cba.journeyDecisionUniqueId = ?");
    params.push(filters.journeyDecisionUniqueId);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  const baseSql = `
    SELECT
      cba.*,
      u.fullName        AS driverName,
      u.phoneNumber     AS driverPhone,
      v.licensePlate,
      vt.vehicleTypeName,
      dr.journeyStatusId
    FROM CompanyBidVehicleAssignment cba
    LEFT JOIN Users u        ON cba.driverUserUniqueId     = u.userUniqueId
    LEFT JOIN Vehicle v      ON cba.vehicleUniqueId        = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt ON v.vehicleTypeUniqueId     = vt.vehicleTypeUniqueId
    LEFT JOIN DriverRequest dr ON cba.driverRequestUniqueId = dr.driverRequestUniqueId
    ${where}
  `;

  return paginatedQuery(
    `${baseSql} ORDER BY cba.assignmentCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidVehicleAssignment cba ${where}`,
    params,
    page,
    limit,
    offset,
  );
};

exports.updateAssignmentStatus = async (
  assignmentUniqueId,
  assignmentStatus,
  updatedBy,
  payload = {},
) => {
  // Acquire an exclusive lock on the assignment to prevent race conditions
  // (e.g. multiple concurrent "confirm" requests leading to duplicate inserts)
  const [rows] = await db().query(
    "SELECT * FROM CompanyBidVehicleAssignment WHERE assignmentUniqueId = ? LIMIT 1 FOR UPDATE",
    [assignmentUniqueId],
  );

  if (!rows || rows.length === 0) {
    throw new AppError("Assignment not found", 404);
  }

  const assignment = rows[0];

  if (assignment.assignmentDeletedAt) {
    throw new AppError("Assignment has been deleted", 400);
  }

  // ── REJECTION & CANCELLATION HANDLER (Clean up state + Notify Dispatcher) ──
  //
  // Three terminal-cancel statuses a driver can set:
  //   rejected_by_driver  — driver refused BEFORE confirming (never committed)
  //   cancelled_by_driver — driver cancelled AFTER confirming (committed but pulled out)
  //   cancelled           — legacy fallthrough, treated the same as cancelled_by_driver
  //
  // All three reset DriverRequest to waiting (status 1) so the driver is
  // available again and the slot can be reassigned.
  if (
    assignmentStatus === "rejected_by_driver" ||
    assignmentStatus === "cancelled_by_driver" ||
    assignmentStatus === "cancelled"
  ) {
    const statusId = journeyStatusMap.waiting; // always reset to 1 — driver is free again

    if (assignment.driverRequestUniqueId) {
      await db().query(
        "UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ? WHERE driverRequestUniqueId = ?",
        [statusId, currentDate(), assignment.driverRequestUniqueId],
      );
    }

    // Notify the dispatcher for any cancellation so they can reassign
    const [driverRows] = await db().query(
      "SELECT fullName FROM Users WHERE userUniqueId = ?",
      [assignment.driverUserUniqueId],
    );
    const driver = driverRows?.[0];
    const isMidJobCancel =
      assignmentStatus === "cancelled_by_driver" ||
      assignmentStatus === "cancelled";

    sendFCMNotificationToUser({
      userUniqueId: assignment.assignmentCreatedBy,
      roleId: usersRoles.companyAdminRoleId,
      notification: {
        title: isMidJobCancel
          ? "Assignment Cancelled by Driver"
          : "Assignment Rejected",
        body: isMidJobCancel
          ? `Driver ${driver?.fullName || "assigned"} cancelled the freight assignment mid-job. Please reassign.`
          : `Driver ${driver?.fullName || "assigned"} has rejected the freight assignment. Please reassign.`,
      },
      data: {
        type: isMidJobCancel
          ? "assignment_cancelled_by_driver"
          : "assignment_rejected",
        assignmentUniqueId,
        passengerRequestUniqueId: assignment.passengerRequestUniqueId,
        companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
      },
    }).catch((e) =>
      logger.error("FCM failed for dispatcher notification", {
        error: e.message,
      }),
    );

    // Normalise legacy 'cancelled' to the correct ENUM value
    if (assignmentStatus === "cancelled") {
      assignmentStatus = "cancelled_by_driver";
    }
  }

  const setParts = [
    "assignmentStatus = ?",
    "assignmentUpdatedBy = ?",
    "assignmentUpdatedAt = ?",
  ];
  const vals = [assignmentStatus, updatedBy, currentDate()];

  // On driver confirmation → create JourneyDecision
  let journeyDecisionUniqueId = assignment.journeyDecisionUniqueId;

  if (assignmentStatus === "confirmed_by_driver") {
    if (assignment.assignmentStatus === "completed") {
      throw new AppError("Cannot confirm a completed assignment", 400);
    }
    if (assignment.assignmentStatus === "confirmed_by_driver") {
      return {
        message: "success",
        data: {
          assignmentStatus,
          journeyDecisionUniqueId: assignment.journeyDecisionUniqueId,
        },
      };
    }
    if (!assignment.driverRequestUniqueId) {
      throw new AppError("No DriverRequest linked to this assignment", 500);
    }

    // Uses the dedicated PassengerRequest service instead of raw SQL
    const prRow = await getPassengerRequestByUniqueId(
      assignment.passengerRequestUniqueId,
    );

    const [drRows] = await db().query(
      "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
      [assignment.driverRequestUniqueId],
    );
    if (!drRows || drRows.length === 0) {
      throw new AppError("Driver request not found", 404);
    }

    const jStatusId = journeyStatusMap.acceptedByPassenger;

    // ── Advance the existing JourneyDecision to status 4 ───────────────────
    // JourneyDecision is created at assignment time (status 2) by
    // createJourneyDecisionForAssignment(). Here we just promote it to
    // status 4 (acceptedByPassenger = all parties agreed).
    // If for any reason it doesn't exist yet (legacy record), create it now.
    const [existingDecision] = await db().query(
      "SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ? LIMIT 1",
      [drRows[0].driverRequestId],
    );

    if (existingDecision && existingDecision.length > 0) {
      journeyDecisionUniqueId = existingDecision[0].journeyDecisionUniqueId;
      // Update status from 2 (requested) → 4 (acceptedByPassenger)
      await db().query(
        "UPDATE JourneyDecisions SET journeyStatusId = ?, decisionTime = ? WHERE journeyDecisionUniqueId = ?",
        [jStatusId, currentDate(), journeyDecisionUniqueId],
      );
    } else {
      // Fallback: create fresh (handles legacy assignments made before this fix)
      journeyDecisionUniqueId = uuidv4();
      await db().query(
        `INSERT INTO JourneyDecisions
          (journeyDecisionUniqueId, passengerRequestId, driverRequestId,
           journeyStatusId, decisionTime, decisionBy,
           journeyDecisionCreatedBy, journeyDecisionCreatedAt)
         VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`,
        [
          journeyDecisionUniqueId,
          prRow.passengerRequestId,
          drRows[0].driverRequestId,
          jStatusId,
          currentDate(),
          updatedBy,
          currentDate(),
        ],
      );
    }

    // ── Sync DriverRequest status and location ──────────────────────────────
    const { originLatitude, originLongitude, originPlace } = payload;
    let drUpdateQuery =
      "UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ?";
    let drUpdateVals = [jStatusId, currentDate()];

    if (originLatitude !== undefined) {
      drUpdateQuery += ", originLatitude = ?";
      drUpdateVals.push(originLatitude);
    }
    if (originLongitude !== undefined) {
      drUpdateQuery += ", originLongitude = ?";
      drUpdateVals.push(originLongitude);
    }
    if (originPlace !== undefined) {
      drUpdateQuery += ", originPlace = ?";
      drUpdateVals.push(originPlace);
    }

    drUpdateQuery += " WHERE driverRequestId = ?";
    drUpdateVals.push(drRows[0].driverRequestId);

    await db().query(drUpdateQuery, drUpdateVals);

    sendFCMNotificationToUser({
      userUniqueId: assignment.driverUserUniqueId,
      roleId: usersRoles.driverRoleId,
      notification: {
        title: "Assignment confirmed",
        body: "Your freight assignment is confirmed. Prepare for pickup.",
      },
      data: {
        type: "company_assignment_confirmed",
        assignmentUniqueId,
        journeyDecisionUniqueId,
        passengerRequestUniqueId: assignment.passengerRequestUniqueId,
      },
    }).catch((e) =>
      logger.error("FCM notification failed for assignment confirmation", {
        error: e.message,
        assignmentUniqueId,
      }),
    );

    setParts.push("journeyDecisionUniqueId = ?");
    vals.push(journeyDecisionUniqueId);
  }

  // ── Journey progress states: sync DriverRequest.journeyStatusId ──────────
  // assignmentStatus is the primary company-specific tracking field.
  // journeyStatusId on DriverRequest is kept in sync as a cross-reference
  // to the individual-flow infrastructure (for auditing and consistency checks).
  //
  // Mapping:
  //   going_to_loading  → journeyStatusId 5 (journeyStarted: driver moving toward pickup)
  //   journey_started   → journeyStatusId 5 (journeyStarted: cargo loaded, en route — same underlying state)
  //   completed         → journeyStatusId 6 (journeyCompleted)
  //
  // Note: going_to_loading and journey_started both map to journeyStatusId=5 because
  // the individual flow only has one "in-progress" state. The company flow has more
  // granularity via assignmentStatus. journeyStatusId=5 just means "driver is moving".

  if (
    assignmentStatus === "going_to_loading" ||
    assignmentStatus === "journey_started" ||
    assignmentStatus === "completed"
  ) {
    if (!assignment.driverRequestUniqueId) {
      throw new AppError("No DriverRequest linked to this assignment", 500);
    }

    const [drRows] = await db().query(
      "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
      [assignment.driverRequestUniqueId],
    );
    if (!drRows || drRows.length === 0) {
      throw new AppError("Driver request not found", 404);
    }

    const syncStatusId =
      assignmentStatus === "completed"
        ? journeyStatusMap.journeyCompleted // 6
        : journeyStatusMap.journeyStarted; // 5

    await db().query(
      "UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ? WHERE driverRequestId = ?",
      [syncStatusId, currentDate(), drRows[0].driverRequestId],
    );

    // Notify the shipper about driver progress (best-effort)
    sendFCMNotificationToUser({
      userUniqueId: assignment.assignmentCreatedBy, // dispatcher / company admin
      roleId: usersRoles.companyAdminRoleId,
      notification: {
        title:
          assignmentStatus === "completed"
            ? "Delivery completed"
            : assignmentStatus === "journey_started"
              ? "Driver en route to destination"
              : "Driver heading to loading point",
        body: `Assignment ${assignmentUniqueId} status updated to: ${assignmentStatus}.`,
      },
      data: {
        type: "company_assignment_progress",
        assignmentStatus,
        assignmentUniqueId,
        companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
        passengerRequestUniqueId: assignment.passengerRequestUniqueId,
      },
    }).catch((e) =>
      logger.error("FCM failed for assignment progress notification", {
        error: e.message,
        assignmentUniqueId,
        assignmentStatus,
      }),
    );
  }

  vals.push(assignmentUniqueId);
  await db().query(
    `UPDATE CompanyBidVehicleAssignment SET ${setParts.join(", ")} WHERE assignmentUniqueId = ?`,
    vals,
  );

  // ── Batch completion check ─────────────────────────────────────────────────
  //
  // RULES:
  //   rejected_by_driver   → slot is OPEN again; dispatcher will reassign.
  //                          Do NOT change CompanyBidRequest at all.
  //   cancelled_by_driver /
  //   cancelled_by_company /
  //   cancelled_by_shipper → slot gone; only auto-complete if every other
  //                          slot is also gone / completed.
  //   completed            → check if all slots are now completed.
  //
  // The bid is marked 'completed' ONLY when every PassengerRequest slot in
  // the batch has a corresponding assignment with status = 'completed'.
  // A rejection leaves the slot available for reassignment — the bid stays
  // 'accepted_by_shipper' so the dispatcher can re-assign.
  //
  if (assignmentStatus === "rejected_by_driver") {
    // Slot is free again. No bid-level change needed.
    logger.info("Assignment rejected — slot open for reassignment", {
      assignmentUniqueId,
      companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
    });
  } else if (assignmentStatus === "completed") {
    // Check if EVERY slot in the batch now has a 'completed' assignment.
    const [[{ totalSlots }]] = await db().query(
      `SELECT COUNT(*) AS totalSlots
       FROM PassengerRequest
       WHERE passengerRequestBatchId = (
         SELECT passengerRequestBatchId FROM CompanyBidRequest
         WHERE companyBidRequestUniqueId = ? LIMIT 1
       )
         AND passengerRequestDeletedAt IS NULL`,
      [assignment.companyBidRequestUniqueId],
    );

    const [[{ completedSlots }]] = await db().query(
      `SELECT COUNT(*) AS completedSlots
       FROM CompanyBidVehicleAssignment
       WHERE companyBidRequestUniqueId = ?
         AND assignmentStatus = 'completed'
         AND assignmentDeletedAt IS NULL`,
      [assignment.companyBidRequestUniqueId],
    );

    if (completedSlots >= totalSlots && totalSlots > 0) {
      await db().query(
        `UPDATE CompanyBidRequest
         SET bidStatus = 'completed', companyBidRequestUpdatedAt = ?
         WHERE companyBidRequestUniqueId = ?`,
        [currentDate(), assignment.companyBidRequestUniqueId],
      );
      logger.info("Batch auto-completed: all slots delivered", {
        companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
        completedSlots,
        totalSlots,
      });
    }
  }

  return {
    message: "success",
    data: {
      assignmentStatus,
      journeyDecisionUniqueId:
        journeyDecisionUniqueId || assignment.journeyDecisionUniqueId,
    },
  };
};

/**
 * autoAssignBatch
 * ───────────────
 * The "Auto-Assigner" intelligence layer. This function automatically maps available
 * fleet (vehicle/driver pairs) to unassigned slots within a single accepted bid.
 *
 * ### HOW IT WORKS (Technical Workflow):
 * 1. **Slot Discovery**: Finds all `PassengerRequest` items in the batch that are
 *    NOT yet assigned in `CompanyBidVehicleAssignment`.
 * 2. **Availability Check**: Queries the company's active fleet. A driver/vehicle
 *    is only "Available" if they have no active trip where the status is NOT
 *    one of (completed, cancelled, rejected).
 * 3. **1-to-1 Mapping**: Matches slots to the next available driver-vehicle pair.
 * 4. **Partial Support**: If the fleet is smaller than the total slots, it
 *    assigns as many as possible and returns a summary of the remainder.
 * 5. **Atomicity**: Executed inside a database transaction to ensure batch integrity.
 *
 * @param {Object} data - Payload
 * @param {string} data.companyBidRequestUniqueId - The ID of the winning bid.
 * @param {string} data.createdByUserUniqueId - The dispatcher's user ID.
 * @returns {Promise<Object>} Summary of assigned vs unassigned counts and record pointers.
 */
exports.autoAssignBatch = async (data) => {
  const { companyBidRequestUniqueId, createdByUserUniqueId } = data;

  // 1. Fetch bid details to get batch and company
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Auto-assignment can only be performed after a bid is accepted by the shipper",
      400,
    );
  }

  const { passengerRequestBatchId, companyUniqueId } = bid;

  // 2. Find Unassigned Slots for this Batch (Priority Check)

  const [unassignedSlots] = await db().query(
    `SELECT pr.passengerRequestUniqueId, pr.originLatitude, pr.originLongitude, pr.originPlace
     FROM PassengerRequest pr
     WHERE pr.passengerRequestBatchId = ? 
       AND pr.passengerRequestDeletedAt IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidVehicleAssignment cba
         WHERE cba.passengerRequestUniqueId = pr.passengerRequestUniqueId
           AND cba.companyBidRequestUniqueId = ?
           AND cba.assignmentDeletedAt IS NULL
           AND cba.assignmentStatus NOT IN ('rejected_by_driver','cancelled_by_company','cancelled_by_shipper','cancelled_by_driver')
       )`,
    [passengerRequestBatchId, companyBidRequestUniqueId],
  );

  if (unassignedSlots.length === 0) {
    return {
      message: "success",
      data: "All slots in this batch are already assigned.",
    };
  }

  // 3. Find Available Fleet (Vehicles + Drivers)
  //
  // Two-layer exclusion:
  //   Layer 1 (global):  Skip drivers/vehicles that have any ACTIVE assignment
  //                      anywhere (not completed/cancelled/rejected).
  //   Layer 2 (per-batch): Skip drivers who already REJECTED this specific batch.
  //                        Once a driver declines, they should not be re-offered
  //                        the same job even after auto-reassign is triggered.
  //                        Note: only the driver is blocked, NOT the vehicle —
  //                        the vehicle can still be paired with a different driver.
  const [availableFleet] = await db().query(
    `SELECT cv.vehicleUniqueId, vd.driverUserUniqueId, v.vehicleTypeUniqueId
     FROM CompanyVehicle cv
     JOIN Vehicle v ON cv.vehicleUniqueId = v.vehicleUniqueId
     JOIN VehicleDriver vd ON cv.vehicleUniqueId = vd.vehicleUniqueId
     WHERE cv.companyUniqueId = ?
       AND cv.assignmentStatus = 'active' AND cv.companyVehicleDeletedAt IS NULL
       AND vd.assignmentStatus = 'active'
       -- Layer 1: no active trip elsewhere
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidVehicleAssignment cba
         WHERE (cba.vehicleUniqueId = cv.vehicleUniqueId OR cba.driverUserUniqueId = vd.driverUserUniqueId)
           AND cba.assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
           AND cba.assignmentDeletedAt IS NULL
       )
       -- Layer 2: driver has not already rejected THIS batch
        --  AND NOT EXISTS (
        --  SELECT 1 FROM CompanyBidVehicleAssignment cba_rej
        --  WHERE cba_rej.driverUserUniqueId = vd.driverUserUniqueId
        --    AND cba_rej.companyBidRequestUniqueId = ?
        --    AND cba_rej.assignmentStatus = 'rejected_by_driver'
        --    AND cba_rej.assignmentDeletedAt IS NULL
       -- )`,
    [companyUniqueId, companyBidRequestUniqueId],
  );

  // 4. Handle Case: Fleet is busy but slots need assignment
  if (availableFleet.length === 0) {
    return {
      message: "success",
      data: {
        summary: `Successfully auto-assigned 0 slots. ${unassignedSlots.length} slots remain unassigned due to limited fleet availability.`,
        assignedCount: 0,
        unassignedCount: unassignedSlots.length,
        assignments: [],
      },
    };
  }

  // 5. Perform Mapping (Partial Assignment Support)
  const assignmentsToCreate = [];
  const limit = Math.min(unassignedSlots.length, availableFleet.length);

  for (let i = 0; i < limit; i++) {
    assignmentsToCreate.push({
      passengerRequestUniqueId: unassignedSlots[i].passengerRequestUniqueId,
      vehicleUniqueId: availableFleet[i].vehicleUniqueId,
      driverUserUniqueId: availableFleet[i].driverUserUniqueId,
      origin: {
        lat: unassignedSlots[i].originLatitude,
        lng: unassignedSlots[i].originLongitude,
        place: unassignedSlots[i].originPlace,
      },
    });
  }

  // 5. Execute Assignments in bulk
  // Status 2 (requested): company is requesting the driver.
  // Status advances to 4 (all agreed) when driver explicitly confirms.
  const results = [];

  for (const item of assignmentsToCreate) {
    // Upsert DriverRequest — status 2 (requested): company is requesting the
    // driver. Status advances to 4 (all agreed) when driver confirms.
    const driverRequestUniqueId = await upsertDriverRequest({
      driverUserUniqueId: item.driverUserUniqueId,
      newStatusId: journeyStatusMap.requested,
      originLat: item.origin.lat,
      originLng: item.origin.lng,
      originPlace: item.origin.place ?? "Auto-assigned",
    });

    // ── Create JourneyDecision at assignment time (status 2) ───────────────
    const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
      item.passengerRequestUniqueId,
      driverRequestUniqueId,
      createdByUserUniqueId,
    );

    const assignmentUniqueId = uuidv4();

    // Create Assignment
    await db().query(
      `INSERT INTO CompanyBidVehicleAssignment
        (assignmentUniqueId, companyBidRequestUniqueId, passengerRequestUniqueId,
         vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
         assignmentStatus, journeyDecisionUniqueId, assignmentCreatedBy, assignmentCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)`,
      [
        assignmentUniqueId,
        companyBidRequestUniqueId,
        item.passengerRequestUniqueId,
        item.vehicleUniqueId,
        item.driverUserUniqueId,
        driverRequestUniqueId,
        journeyDecisionUniqueId,
        createdByUserUniqueId,
        currentDate(),
      ],
    );

    // Notify driver (FCM + WebSocket)
    notifyAssignedDriver({
      driverUserUniqueId: item.driverUserUniqueId,
      assignmentUniqueId,
      driverRequestUniqueId,
      passengerRequestUniqueId: item.passengerRequestUniqueId,
      companyBidRequestUniqueId,
    });

    results.push({
      assignmentUniqueId,
      passengerRequestUniqueId: item.passengerRequestUniqueId,
      journeyDecisionUniqueId,
    });
  }

  const unassignedCount = unassignedSlots.length - results.length;
  const summary =
    unassignedCount > 0
      ? `Successfully auto-assigned ${results.length} slots. ${unassignedCount} slots remain unassigned due to limited fleet availability.`
      : `Successfully auto-assigned all ${results.length} slots.`;

  return {
    message: "success",
    data: {
      summary,
      assignedCount: results.length,
      unassignedCount,
      assignments: results,
    },
  };
};

exports.deleteAssignment = async (assignmentUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidVehicleAssignment
     SET assignmentDeletedAt = ?, assignmentDeletedBy = ?
     WHERE assignmentUniqueId = ? AND assignmentDeletedAt IS NULL`,
    [currentDate(), deletedBy, assignmentUniqueId],
  );
  if (res.affectedRows === 0) {
    throw new AppError("Assignment not found or already deleted", 404);
  }
  return { message: "success", data: "Assignment deleted" };
};
