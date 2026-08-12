"use strict";
/* eslint-disable max-lines, promise/no-nesting */

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  paginate,
  paginatedQuery,
} = require("../CompanyHelper.service");
const { getData } = require("../../CRUD/Read/ReadData");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");

const { sendFCMNotificationToUser } = require("../Firebase.service");
const {
  promoteToAcceptedByShipperAndCreateJourney,
} = require("../Journey");

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
  const [bidRow] = await getData({
    tableName: "CompanyBidRequest",
    conditions: { companyBidRequestUniqueId },
  });
  if (!bidRow) throw new AppError("Bid not found", AppError.NOT_FOUND);
  const bid = bidRow;
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Bid must be accepted_by_shipper before creating assignments",
      AppError.BAD_REQUEST,
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
      bid.shipperRequestBatchUniqueId,
    );

    // Prevent duplicate assignment
    const existingAssignment = await findActiveAssignmentForSlot(
      companyBidRequestUniqueId,
      shipperRequestUniqueId,
    );
    if (existingAssignment) {
      throw new AppError(
        `Slot ${shipperRequestUniqueId} already has an active assignment`,
        AppError.CONFLICT,
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
    shipperRequestBatchUniqueId: bid.shipperRequestBatchUniqueId,
    results: results.map((r) => ({
      assignmentUniqueId: r.assignmentUniqueId,
      shipperRequestUniqueId: r.shipperRequestUniqueId,
    })),
  });

  return { message: "Assignment status updated", data: results };
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

  const BASE_COLS = `
    cba.assignmentUniqueId,
    cba.assignmentStatus,
    cba.companyBidRequestUniqueId,
    cba.driverUserUniqueId,
    cba.journeyDecisionUniqueId,
    u.fullName,
    u.phoneNumber,
    v.licensePlate,
    v.color,
    vt.vehicleTypeUniqueId,
    vt.vehicleTypeName,
    dr.driverRequestUniqueId   AS drUniqueId,
    dr.originLatitude,
    cba.vehicleUniqueId,
    dr.originLongitude,
    dr.originPlace,
    dr.journeyStatusId,
    sr.shipperRequestUniqueId,
    sr.shipperRequestId,
    sr.originLatitude          AS srOriginLatitude,
    sr.originLongitude         AS srOriginLongitude,
    sr.originPlace             AS srOriginPlace,
    sr.destinationLatitude,
    sr.destinationLongitude,
    sr.destinationPlace,
    sr.shippableItemName,
    sr.shippingCost,
    sr.vehicleTypeUniqueId     AS srVehicleTypeUniqueId,
    sr.requestMode,
    sr.journeyStatusId         AS srJourneyStatusId,
    jd.decisionTime,
    jd.decisionBy,
    jd.journeyStatusId         AS jdJourneyStatusId,
    j.startTime AS journeyStartedAt,
    j.endTime AS journeyCompletedAt
  `;

  const baseSql = `
    SELECT ${BASE_COLS}
    FROM CompanyBidVehicleAssignment cba
    LEFT JOIN Users u           ON cba.driverUserUniqueId     = u.userUniqueId
    LEFT JOIN Vehicle v         ON cba.vehicleUniqueId        = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt   ON v.vehicleTypeUniqueId      = vt.vehicleTypeUniqueId
    LEFT JOIN DriverRequest dr  ON cba.driverRequestUniqueId  = dr.driverRequestUniqueId
    LEFT JOIN ShipperRequest sr ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
    LEFT JOIN JourneyDecisions jd ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
    LEFT JOIN Journey j         ON cba.journeyDecisionUniqueId = j.journeyDecisionUniqueId
    ${where}
  `;

  const raw = await paginatedQuery(
    `${baseSql} ORDER BY cba.assignmentCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidVehicleAssignment cba ${where}`,
    params,
    page,
    limit,
    offset,
  );

  raw.data = raw.data.map((r) => ({
    assignmentUniqueId: r.assignmentUniqueId,
    assignmentStatus: r.assignmentStatus,
    shipperRequest: {
      shipperRequestUniqueId: r.shipperRequestUniqueId,
      shipperRequestId: r.shipperRequestId,
      originLatitude: r.srOriginLatitude,
      originLongitude: r.srOriginLongitude,
      originPlace: r.srOriginPlace,
      destinationLatitude: r.destinationLatitude,
      destinationLongitude: r.destinationLongitude,
      destinationPlace: r.destinationPlace,
      shippableItemName: r.shippableItemName,
      shippingCost: r.shippingCost,
      vehicleTypeUniqueId: r.srVehicleTypeUniqueId,
      requestMode: r.requestMode,
      journeyStatusId: r.srJourneyStatusId,
    },
    driverRequests: [
      {
        driverRequestUniqueId: r.drUniqueId,
        vehicleUniqueId: r.vehicleUniqueId,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber,
        userUniqueId: r.driverUserUniqueId,
        originLatitude: r.originLatitude,
        originLongitude: r.originLongitude,
        originPlace: r.originPlace,
        journeyStatusId: r.journeyStatusId,
        vehicleOfDriver: {
          licensePlate: r.licensePlate,
          vehicleTypeUniqueId: r.vehicleTypeUniqueId,
          vehicleTypeName: r.vehicleTypeName,
          color: r.color,
        },
      },
    ],
    decisions: [
      {
        journeyDecisionUniqueId: r.journeyDecisionUniqueId,
        journeyStatusId: r.jdJourneyStatusId,
        decisionTime: r.decisionTime,
        decisionBy: r.decisionBy,
      },
    ],
    journey:
      r.journeyStartedAt || r.journeyCompletedAt
        ? {
            journeyDecisionUniqueId: r.journeyDecisionUniqueId,
            journeyStartedAt: r.journeyStartedAt,
            journeyCompletedAt: r.journeyCompletedAt,
          }
        : {},
  }));

  return raw;
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
    throw new AppError("Assignment not found", AppError.NOT_FOUND);
  }

  const assignment = rows[0];

  if (assignment.assignmentDeletedAt) {
    throw new AppError("Assignment has been deleted", AppError.BAD_REQUEST);
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
              message: isMidJobCancel
                ? "Assignment cancelled by driver"
                : "Assignment rejected by driver",
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
          }          ).catch((e) =>
            logger.error("WebSocket to company failed on driver reject", {
              error: e.message,
              companyUniqueId,
            }),
          );
        }
        return undefined;
      },
    ).catch((e) =>
      logger.error("WebSocket to company failed on driver reject", {
        error: e.message,
      }),
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
              message: isMidJobCancel
                ? "Assignment cancelled by driver"
                : "Assignment rejected by driver",
              notification: shipperNotif,
              data: shipperData,
            },
          }          ).catch((e) =>
            logger.warn("WebSocket to shipper failed on driver reject", {
              error: e.message,
              assignmentUniqueId,
            }),
          );
        }
        return undefined;
      },
    ).catch((e) =>
      logger.error("WebSocket to shipper failed on driver reject", {
        error: e.message,
      }),
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
  // Set by the shared promote helper when the driver confirms; surfaced in the
  // response so the driver app can jump straight to the created Journey.
  let promotedJourneyUniqueId = null;

  if (assignmentStatus === "confirmed_by_driver") {
    if (assignment.assignmentStatus === "completed") {
      throw new AppError("Cannot confirm a completed assignment", AppError.BAD_REQUEST);
    }
    if (assignment.assignmentStatus === "confirmed_by_driver") {
      return {
        message: "Assignment confirmed",
        data: {
          assignmentStatus,
          journeyDecisionUniqueId: assignment.journeyDecisionUniqueId,
        },
      };
    }
    if (!assignment.driverRequestUniqueId) {
      throw new AppError("No DriverRequest linked to this assignment", AppError.INTERNAL_SERVER_ERROR);
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
      throw new AppError("Driver request not found", AppError.NOT_FOUND);
    }

    const jStatusId = journeyStatusMap.acceptedByShipper;

    // ── Ensure the JourneyDecision exists ──────────────────────────────────
    // JourneyDecision is created at assignment time (status 2) by
    // createJourneyDecisionForAssignment(). The shared helper below promotes
    // it to status 4 (acceptedByShipper = all parties agreed) AND creates the
    // Journey immediately — same as queue-dispatch accepts, because the price
    // is already agreed. If the decision doesn't exist yet (legacy record),
    // create it first.
    const [existingDecision] = await db().query(
      "SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ? LIMIT 1",
      [drRows[0].driverRequestId],
    );

    if (existingDecision && existingDecision.length > 0) {
      journeyDecisionUniqueId = existingDecision[0].journeyDecisionUniqueId;
    } else {
      // Fallback: create fresh (handles legacy assignments made before this fix)
      journeyDecisionUniqueId = uuidv4();
      await db().query(
        `INSERT INTO JourneyDecisions
          (journeyDecisionUniqueId, shipperRequestId, driverRequestId,
           journeyStatusId, decisionTime, decisionBy,
           shippingCostByDriver, journeyDecisionCreatedBy, journeyDecisionCreatedAt)
         VALUES (?, ?, ?, ?, ?, 'company', ?, ?, ?)`,
        [
          journeyDecisionUniqueId,
          prRow.shipperRequestId,
          drRows[0].driverRequestId,
          jStatusId,
          currentDate(),
          prRow.shippingCost || 0,
          updatedBy,
          currentDate(),
        ],
      );
    }

    // ── Promote to status 4 + create the Journey (shared with queue) ──────
    // Price is agreed up front (company bid) → skip the 1→2→3→4→5
    // negotiation flow; the Journey is born at acceptedByShipper.
    const promotedJourney = await promoteToAcceptedByShipperAndCreateJourney({
      journeyDecisionUniqueId,
      driverRequestUniqueId: assignment.driverRequestUniqueId,
      shipperRequestUniqueId: assignment.shipperRequestUniqueId,
      shippingCostByDriver: prRow.shippingCost || 0,
      journeyCreatedBy: updatedBy,
    });
    promotedJourneyUniqueId =
      promotedJourney?.data?.[0]?.journeyUniqueId || null;

    // Refresh decisionTime to the confirm instant (updateJourneyStatus does
    // not touch it) — preserves the pre-refactor behavior.
    await db().query(
      "UPDATE JourneyDecisions SET decisionTime = ? WHERE journeyDecisionUniqueId = ?",
      [currentDate(), journeyDecisionUniqueId],
    );

    // ── Sync DriverRequest location (status already set by the helper) ─────
    const { originLatitude, originLongitude, originPlace } = payload;
    let drUpdateQuery =
      "UPDATE DriverRequest SET driverRequestUpdatedAt = ?";
    let drUpdateVals = [currentDate()];

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
              message: "Driver confirmed assignment",
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
          }          ).catch((e) =>
            logger.error("WebSocket to company failed on driver confirm", {
              error: e.message,
              companyUniqueId,
            }),
          );
        }
        return undefined;
      },
    ).catch((e) =>
      logger.error("WebSocket to company failed on driver confirm", {
        error: e.message,
      }),
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
              message: "Driver confirmed assignment",
              notification: shipperNotif,
              data: fullAssignment || shipperData,
            },
          }          ).catch((e) =>
            logger.warn("WebSocket to shipper failed on driver confirm", {
              error: e.message,
              assignmentUniqueId,
            }),
          );
        }
        return undefined;
      },
    ).catch((e) =>
      logger.error("WebSocket to shipper failed on driver confirm", {
        error: e.message,
      }),
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
      throw new AppError("No DriverRequest linked to this assignment", AppError.INTERNAL_SERVER_ERROR);
    }

    const [drRows] = await db().query(
      "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
      [assignment.driverRequestUniqueId],
    );
    if (!drRows || drRows.length === 0) {
      throw new AppError("Driver request not found", AppError.NOT_FOUND);
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
                message: `Assignment ${assignmentStatus}`,
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
          return undefined;
        },
      ).catch((e) =>
        logger.error("WebSocket to company failed on progress update", {
          error: e.message,
        }),
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
                message: `Assignment ${assignmentStatus}`,
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
          return undefined;
        },
      ).catch((e) =>
        logger.error("WebSocket to shipper failed on progress update", {
          error: e.message,
        }),
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
       WHERE shipperRequestBatchUniqueId = (
         SELECT shipperRequestBatchUniqueId FROM CompanyBidRequest
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
    message: "Assignment status updated",
    data: {
      assignmentStatus,
      journeyDecisionUniqueId:
        journeyDecisionUniqueId || assignment.journeyDecisionUniqueId,
      // When the driver confirms (price already agreed), the shared helper
      // promotes to acceptedByShipper (4) and creates the Journey — surface
      // both like the queue accept flow does.
      ...(assignmentStatus === "confirmed_by_driver" && {
        status: journeyStatusMap.acceptedByShipper,
        journeyUniqueId: promotedJourneyUniqueId,
      }),
    },
  };
};
