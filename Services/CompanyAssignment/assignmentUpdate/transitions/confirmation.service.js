"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../../../Utils/CurrentDate");
const AppError = require("../../../../Utils/AppError");
const { db } = require("../../../CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../../../../Utils/ListOfSeedData");
const { getShipperRequestByUniqueId } = require("../../../ShipperRequest");
const { updateJourneyStatus } = require("../../../JourneyStatus");
const { sendFCMNotificationToUser } = require("../../../Firebase.service");
const logger = require("../../../../Utils/logger");
const messageTypes = require("../../../../Utils/MessageTypes");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToShipper,
} = require("../../../../Utils/Notifications");
const { getCompanyUniqueId, getShipperContact } = require("../helpers");

const handleDriverConfirmation = async ({
  assignment,
  assignmentStatus,
  assignmentUniqueId,
  updatedBy,
  payload,
  fullAssignment,
  setParts,
  vals,
  journeyDecisionUniqueId,
}) => {
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
    // createJourneyDecisionForAssignment(). The promise below promotes it to
    // status 4 (acceptedByShipper = all parties agreed). If the decision
    // doesn't exist yet (legacy record), create it first.
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

    // ── Decision promotion to status 4 (no Journey yet) ──────────────────
    // Price is agreed up front (company bid) → skip the 1→2→3→4→5 negotiation
    // flow and land straight on acceptedByShipper (4). No Journey is created at
    // confirm: the Journey row is born only when the driver heads to the
    // loading place (goToLoadingPlace = 5) — see journeyManagement
    // transitionLoadingStage (same standard as queue/nearby/street).
    await updateJourneyStatus({
      journeyDecisionUniqueId,
      driverRequestUniqueId: assignment.driverRequestUniqueId,
      shipperRequestUniqueId: assignment.shipperRequestUniqueId,
      journeyStatusId: journeyStatusMap.acceptedByShipper,
    });

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
    const { releaseConflictingOffers } = require("../../../DriverRequest");
    await releaseConflictingOffers(
      assignment.driverUserUniqueId,
      "company",
      assignment.driverRequestUniqueId,
    );

    setParts.push("journeyDecisionUniqueId = ?");
    vals.push(journeyDecisionUniqueId);
  }
  return journeyDecisionUniqueId;
};

module.exports.handleDriverConfirmation = handleDriverConfirmation;
