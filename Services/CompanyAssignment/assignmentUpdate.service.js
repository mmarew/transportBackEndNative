"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("../CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");

const { sendFCMNotificationToUser } = require("../Firebase.service");

const logger = require("../../Utils/logger");
const messageTypes = require("../../Utils/MessageTypes");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");



const { getShipperRequestByUniqueId } = require("../ShipperRequest");

/**
 * Resolve companyUniqueId from a CompanyBidVehicleAssignment record.
 */
const getCompanyUniqueId = async (companyBidRequestUniqueId) => {
  const [[bid]] = await db().query(
    "SELECT companyUniqueId FROM CompanyBidRequest WHERE companyBidRequestUniqueId = ? LIMIT 1",
    [companyBidRequestUniqueId],
  );
  return bid?.companyUniqueId || null;
};

const getShipperContact = async (shipperRequestUniqueId) => {
  const [[row]] = await db().query(
    `SELECT u.userUniqueId, u.phoneNumber
     FROM ShipperRequest sr
     JOIN Users u ON sr.userUniqueId = u.userUniqueId
     WHERE sr.shipperRequestUniqueId = ? LIMIT 1`,
    [shipperRequestUniqueId],
  );
  return row || null;
};

const {
  reportDriverCommissionEvasion,
} = require("../CommissionEvasion.service");
const {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  upsertDriverRequest,
  findActiveAssignmentForSlot,
  getFullAssignmentData,
} = require("./assignmentHelper");

const { notifyShipperOnAssignment } = require("./assignmentCreate.service");

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
  // const acceptedStatusId = journeyStatusMap.acceptedByDriver;

  const results = [];

  // 3. Process each assignment in the bulk array
  for (const item of assignments) {
    const { shipperRequestUniqueId, vehicleUniqueId, driverUserUniqueId } =
      item;

    // Check if slot belongs to the batch — uses the dedicated service function
    const sr = await getShipperRequestByUniqueId(
      shipperRequestUniqueId,
      bid.shipperRequestBatchId,
    );

    // Prevent duplicate assignment
    const existingAssignment = await findActiveAssignmentForSlot(
      companyBidRequestUniqueId,
      shipperRequestUniqueId,
    );
    if (existingAssignment) {
      throw new AppError(
        `Slot ${shipperRequestUniqueId} already has an active assignment`,
        409,
      );
    }

    // Upsert DriverRequest — status 2 (requested): company is requesting the
    // driver. Status advances to 4 when driver confirms.
    const driverRequestUniqueId = await upsertDriverRequest({
      driverUserUniqueId,
      newStatusId: journeyStatusMap.requested,
      originLat: sr.originLatitude,
      originLng: sr.originLongitude,
      originPlace: sr.originPlace ?? "Bulk assigned",
    });

    // ── Create JourneyDecision at assignment time (status 2) ───────────────
    const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
      shipperRequestUniqueId,
      driverRequestUniqueId,
      createdByUserUniqueId,
    );

    const assignmentUniqueId = uuidv4();

    // Create Assignment
    await db().query(
      `INSERT INTO CompanyBidVehicleAssignment
        (assignmentUniqueId, companyBidRequestUniqueId, shipperRequestUniqueId,
         vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
         assignmentStatus, journeyDecisionUniqueId, assignmentCreatedBy, assignmentCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)`,
      [
        assignmentUniqueId,
        companyBidRequestUniqueId,
        shipperRequestUniqueId,
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
      shipperRequestUniqueId,
      companyBidRequestUniqueId,
    });

    results.push({
      assignmentUniqueId,
      shipperRequestUniqueId,
      journeyDecisionUniqueId,
    });
  }

  // ── Notify shipper about all assigned drivers ─────────────────────────────
  notifyShipperOnAssignment({
    companyBidRequestUniqueId,
    shipperRequestBatchId: bid.shipperRequestBatchId,
    results: results.map((r) => ({
      assignmentUniqueId: r.assignmentUniqueId,
      shipperRequestUniqueId: r.shipperRequestUniqueId,
    })),
  });

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
  if (filters.shipperRequestUniqueId) {
    clauses.push("cba.shipperRequestUniqueId = ?");
    params.push(filters.shipperRequestUniqueId);
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

  // Fetch full assignment with joins — matches GET /api/company/assignments shape
  let fullAssignment = null;
  try {
    fullAssignment = await getFullAssignmentData(assignmentUniqueId);
  } catch (e) {
    logger.warn("Failed to fetch full assignment data", {
      error: e.message,
      assignmentUniqueId,
    });
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
        shipperRequestUniqueId: assignment.shipperRequestUniqueId,
        companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
      },
    }).catch((e) =>
      logger.error("FCM failed for dispatcher notification", {
        error: e.message,
      }),
    );

    // 🔔 Real-time WebSocket to company
    getCompanyUniqueId(assignment.companyBidRequestUniqueId).then(
      (companyUniqueId) => {
        if (companyUniqueId) {
          sendSocketIONotificationToCompany({
            companyUniqueId,
            message: {
              messageTypes: isMidJobCancel
                ? messageTypes.company_driver_cancelled
                : messageTypes.company_driver_rejected,
              message: "success",
              notification: {
                title: isMidJobCancel
                  ? "Assignment Cancelled by Driver"
                  : "Assignment Rejected",
                body: isMidJobCancel
                  ? `Driver ${driver?.fullName || ""} cancelled mid-job. Please reassign.`
                  : `Driver ${driver?.fullName || ""} rejected the assignment. Please reassign.`,
              },
              data: fullAssignment || {
                type: isMidJobCancel
                  ? "assignment_cancelled_by_driver"
                  : "assignment_rejected",
                assignmentStatus: isMidJobCancel
                  ? "cancelled_by_driver"
                  : "rejected_by_driver",
                assignmentUniqueId,
                shipperRequestUniqueId: assignment.shipperRequestUniqueId,
                companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
              },
            },
          }).catch((e) =>
            logger.error("WebSocket to company failed on driver reject", {
              error: e.message,
              companyUniqueId,
            }),
          );
        }
      },
    );

    // 🔔 Notify shipper about driver rejection / cancellation
    getShipperContact(assignment.shipperRequestUniqueId).then(
      (shipper) => {
        if (shipper) {
          const shipperNotif = {
            title: isMidJobCancel
              ? "Driver Cancelled Assignment"
              : "Driver Rejected Assignment",
            body: isMidJobCancel
              ? `Driver ${driver?.fullName || ""} cancelled mid-job on your freight batch.`
              : `Driver ${driver?.fullName || ""} rejected the freight assignment.`,
          };
          const shipperData = {
            type: isMidJobCancel
              ? "assignment_cancelled_by_driver"
              : "assignment_rejected",
            assignmentStatus: isMidJobCancel
              ? "cancelled_by_driver"
              : "rejected_by_driver",
            assignmentUniqueId,
            companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
          };

          sendFCMNotificationToUser({
            userUniqueId: shipper.userUniqueId,
            roleId: usersRoles.shipperRoleId,
            notification: shipperNotif,
            data: shipperData,
          }).catch((e) =>
            logger.error("FCM failed for shipper on driver reject", {
              error: e.message,
              assignmentUniqueId,
            }),
          );

          sendSocketIONotificationToShipper({
            phoneNumber: shipper.phoneNumber,
            message: {
              messageTypes: isMidJobCancel
                ? messageTypes.company_driver_cancelled
                : messageTypes.company_driver_rejected,
              message: "success",
              notification: shipperNotif,
              data: shipperData,
            },
          }).catch((e) =>
            logger.warn("WebSocket to shipper failed on driver reject", {
              error: e.message,
              assignmentUniqueId,
            }),
          );
        }
      },
    );

    // Normalise legacy 'cancelled' to the correct ENUM value
    if (assignmentStatus === "cancelled") {
      assignmentStatus = "cancelled_by_driver";
    }

    // ── Commission evasion: driver cancelled AFTER confirming ────────────────
    // 'cancelled_by_driver' on a previously 'confirmed_by_driver' assignment
    // means the driver agreed to the job and then backed out = evasion.
    // 'rejected_by_driver' (before confirmation) is NOT evasion — just a refusal.
    // Fire post-commit so it never blocks this transaction.
    if (
      assignmentStatus === "cancelled_by_driver" &&
      assignment.assignmentStatus === "confirmed_by_driver"
    ) {
      setImmediate(async () => {
        try {
          const result = await reportDriverCommissionEvasion({
            driverUserUniqueId: assignment.driverUserUniqueId,
            reportedByUniqueId: updatedBy,
            journeyDecisionUniqueId: assignment.journeyDecisionUniqueId || null,
            reason: `Driver cancelled freight assignment after confirmation (assignment: ${assignmentUniqueId})`,
          });
          logger.info("Driver commission evasion recorded", {
            driverUserUniqueId: assignment.driverUserUniqueId,
            automaticAction: result.automaticAction,
          });
        } catch (err) {
          logger.error("Failed to record driver commission evasion", {
            driverUserUniqueId: assignment.driverUserUniqueId,
            error: err.message,
          });
        }
      });
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

    // Uses the dedicated ShipperRequest service instead of raw SQL
    const prRow = await getShipperRequestByUniqueId(
      assignment.shipperRequestUniqueId,
    );

    const [drRows] = await db().query(
      "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
      [assignment.driverRequestUniqueId],
    );
    if (!drRows || drRows.length === 0) {
      throw new AppError("Driver request not found", 404);
    }

    const jStatusId = journeyStatusMap.acceptedByShipper;

    // ── Advance the existing JourneyDecision to status 4 ───────────────────
    // JourneyDecision is created at assignment time (status 2) by
    // createJourneyDecisionForAssignment(). Here we just promote it to
    // status 4 (acceptedByShipper = all parties agreed).
    // If for any reason it doesn't exist yet (legacy record), create it now.
    const [existingDecision] = await db().query(
      "SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ? LIMIT 1",
      [drRows[0].driverRequestId],
    );

    if (existingDecision && existingDecision.length > 0) {
      journeyDecisionUniqueId = existingDecision[0].journeyDecisionUniqueId;
      // Update status from 2 (requested) → 4 (acceptedByShipper)
      await db().query(
        "UPDATE JourneyDecisions SET journeyStatusId = ?, decisionTime = ? WHERE journeyDecisionUniqueId = ?",
        [jStatusId, currentDate(), journeyDecisionUniqueId],
      );
    } else {
      // Fallback: create fresh (handles legacy assignments made before this fix)
      journeyDecisionUniqueId = uuidv4();
      await db().query(
        `INSERT INTO JourneyDecisions
          (journeyDecisionUniqueId, shipperRequestId, driverRequestId,
           journeyStatusId, decisionTime, decisionBy,
           journeyDecisionCreatedBy, journeyDecisionCreatedAt)
         VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`,
        [
          journeyDecisionUniqueId,
          prRow.shipperRequestId,
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

    // Fetch driver name for notifications (not in scope in this block)
    const [[driverRow]] = await db().query(
      "SELECT fullName FROM Users WHERE userUniqueId = ? LIMIT 1",
      [assignment.driverUserUniqueId],
    );
    const driverName = driverRow?.fullName || "";

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
        shipperRequestUniqueId: assignment.shipperRequestUniqueId,
      },
    }).catch((e) =>
      logger.error("FCM notification failed for assignment confirmation", {
        error: e.message,
        assignmentUniqueId,
      }),
    );

    // 🔔 Real-time WebSocket to company: driver confirmed
    getCompanyUniqueId(assignment.companyBidRequestUniqueId).then(
      (companyUniqueId) => {
        if (companyUniqueId) {
          sendSocketIONotificationToCompany({
            companyUniqueId,
            message: {
              messageTypes: messageTypes.company_driver_confirmed,
              message: "success",
              notification: {
                title: "Driver Confirmed",
                body: `Driver ${driverName} confirmed the freight assignment.`,
              },
              data: fullAssignment || {
                type: "company_driver_confirmed",
                assignmentStatus: "confirmed_by_driver",
                assignmentUniqueId,
                journeyDecisionUniqueId,
                shipperRequestUniqueId: assignment.shipperRequestUniqueId,
                companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
              },
            },
          }).catch((e) =>
            logger.error("WebSocket to company failed on driver confirm", {
              error: e.message,
              companyUniqueId,
            }),
          );
        }
      },
    );

    // 🔔 Notify shipper that driver confirmed
    getShipperContact(assignment.shipperRequestUniqueId).then(
      (shipper) => {
        if (shipper) {
          const shipperNotif = {
            title: "Driver Confirmed",
            body: `Driver ${driverName} confirmed the freight assignment for your batch.`,
          };
          const shipperData = {
            type: "company_driver_confirmed",
            assignmentStatus: "confirmed_by_driver",
            assignmentUniqueId,
            companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
          };

          sendFCMNotificationToUser({
            userUniqueId: shipper.userUniqueId,
            roleId: usersRoles.shipperRoleId,
            notification: shipperNotif,
            data: shipperData,
          }).catch((e) =>
            logger.error("FCM failed for shipper on driver confirm", {
              error: e.message,
              assignmentUniqueId,
            }),
          );

          sendSocketIONotificationToShipper({
            phoneNumber: shipper.phoneNumber,
            message: {
              messageTypes: messageTypes.company_driver_confirmed,
              message: "success",
              notification: shipperNotif,
              data: shipperData,
            },
          }).catch((e) =>
            logger.warn("WebSocket to shipper failed on driver confirm", {
              error: e.message,
              assignmentUniqueId,
            }),
          );
        }
      },
    );

    // ── Phase 1: Auto-release conflicting offers ──────────────────────────
    // Driver confirmed a company assignment → release any pending individual
    // offers so the driver isn't double-booked.
    const { releaseConflictingOffers } = require("../DriverRequest");
    await releaseConflictingOffers(
      assignment.driverUserUniqueId,
      "company",
      assignment.driverRequestUniqueId,
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
      data: fullAssignment || {
        type: "company_assignment_progress",
        assignmentStatus,
        assignmentUniqueId,
        companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
        shipperRequestUniqueId: assignment.shipperRequestUniqueId,
      },
    }).catch((e) =>
      logger.error("FCM failed for assignment progress notification", {
        error: e.message,
        assignmentUniqueId,
        assignmentStatus,
      }),
    );

    // 🔔 Real-time WebSocket to company: progress update
    const socketMsgTypeMap = {
      going_to_loading: messageTypes.company_driver_going_to_loading,
      journey_started: messageTypes.company_driver_journey_started,
      completed: messageTypes.company_driver_completed,
    };
    const socketMsgType = socketMsgTypeMap[assignmentStatus];
    if (socketMsgType) {
      getCompanyUniqueId(assignment.companyBidRequestUniqueId).then(
        (companyUniqueId) => {
          if (companyUniqueId) {
            sendSocketIONotificationToCompany({
              companyUniqueId,
              message: {
                messageTypes: socketMsgType,
                message: "success",
                notification: {
                  title:
                    assignmentStatus === "completed"
                      ? "Delivery completed"
                      : assignmentStatus === "journey_started"
                        ? "Driver en route to destination"
                        : "Driver heading to loading point",
                  body: `Assignment ${assignmentUniqueId} status: ${assignmentStatus}.`,
                },
                data: fullAssignment || {
                  type: "company_assignment_progress",
                  assignmentStatus,
                  assignmentUniqueId,
                  companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
                  shipperRequestUniqueId: assignment.shipperRequestUniqueId,
                },
              },
            }).catch((e) =>
              logger.error(
                "WebSocket to company failed on progress update",
                {
                  error: e.message,
                  companyUniqueId,
                },
              ),
            );
          }
        },
      );

      // 🔔 Notify shipper about driver progress
      getShipperContact(assignment.shipperRequestUniqueId).then(
        (shipper) => {
          if (shipper) {
            const shipperNotif = {
              title:
                assignmentStatus === "completed"
                  ? "Delivery completed"
                  : assignmentStatus === "journey_started"
                    ? "Driver en route to destination"
                    : "Driver heading to loading point",
              body: `Assignment ${assignmentUniqueId} status: ${assignmentStatus}.`,
            };
            const shipperData = {
              type: "company_assignment_progress",
              assignmentStatus,
              assignmentUniqueId,
              companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
            };

            sendFCMNotificationToUser({
              userUniqueId: shipper.userUniqueId,
              roleId: usersRoles.shipperRoleId,
              notification: shipperNotif,
              data: shipperData,
            }).catch((e) =>
              logger.error("FCM failed for shipper on progress update", {
                error: e.message,
                assignmentUniqueId,
              }),
            );

            sendSocketIONotificationToShipper({
              phoneNumber: shipper.phoneNumber,
              message: {
                messageTypes: socketMsgType,
                message: "success",
                notification: shipperNotif,
                data: shipperData,
              },
            }).catch((e) =>
              logger.warn("WebSocket to shipper failed on progress update", {
                error: e.message,
                assignmentUniqueId,
              }),
            );
          }
        },
      );
    }
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
  // The bid is marked 'completed' ONLY when every ShipperRequest slot in
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
       FROM ShipperRequest
       WHERE shipperRequestBatchId = (
         SELECT shipperRequestBatchId FROM CompanyBidRequest
         WHERE companyBidRequestUniqueId = ? LIMIT 1
       )
         AND shipperRequestDeletedAt IS NULL`,
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
