"use strict";

const { currentDate } = require("../../../../Utils/CurrentDate");
const { db } = require("../../../CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../../../../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("../../../Firebase.service");
const logger = require("../../../../Utils/logger");
const messageTypes = require("../../../../Utils/MessageTypes");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToShipper,
} = require("../../../../Utils/Notifications");
const { reportDriverCommissionEvasion } = require("../../../CommissionEvasion.service");
const { getCompanyUniqueId, getShipperContact } = require("../helpers");
const {
  maybeInactivateVehicleOnRepeatedPreconfirmRejection,
} = require("../../assignmentHelper/fleet.service");

const handleDriverRejectionOrCancellation = async ({
  assignment,
  assignmentStatus,
  assignmentUniqueId,
  updatedBy,
  fullAssignment,
}) => {
  // ── REJECTION & CANCELLATION HANDLER (Clean up state + Notify Dispatcher) ──
  //
  // Three terminal-cancel statuses a driver can set:
  //   rejected_by_driver  — driver refused BEFORE confirming (never committed)
  //   cancelled_by_driver — driver cancelled AFTER confirming (committed but pulled out)
  //   cancelled           — legacy fallthrough, treated the same as cancelled_by_driver
  //
  // All three record the outcome on EVERY row that carries the engagement —
  // DriverRequest (what the driver app and the double-booking fence read),
  // JourneyDecisions (what dispatch reads) and Journey (when it already exists).
  // A release that updates one and forgets the others is what left
  // `DriverRequest = waiting` beside a `requested` decision and wedged dispatch.
  // The ShipperRequest is deliberately NOT touched: its journeyStatusId belongs
  // to the shipper/admin, so a driver backing out never rewrites the order.
  // Availability is unaffected — a rejection status leaves activeRequestGuard
  // NULL, and the next assignment/match creates a fresh DriverRequest.
  if (
    assignmentStatus === "rejected_by_driver" ||
    assignmentStatus === "cancelled_by_driver" ||
    assignmentStatus === "cancelled"
  ) {
    // One status for all three tables: `rejectedByDriver` (18) when the driver
    // refused before confirming, `cancelledByDriver` (12) when they backed out
    // after confirming.
    const driverOutcomeStatusId =
      assignmentStatus === "rejected_by_driver"
        ? journeyStatusMap.rejectedByDriver
        : journeyStatusMap.cancelledByDriver;

    if (assignment.driverRequestUniqueId) {
      await db().query(
        "UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ? WHERE driverRequestUniqueId = ?",
        [driverOutcomeStatusId, currentDate(), assignment.driverRequestUniqueId],
      );
    }

    // Keep the decision honest: it must carry the SAME rejection as the request,
    // otherwise the fence (which reads the decision) and the driver app (which
    // reads the request) disagree about whether the driver is engaged.
    if (assignment.journeyDecisionUniqueId) {
      await db().query(
        "UPDATE JourneyDecisions SET journeyStatusId = ?, journeyDecisionUpdatedAt = ? WHERE journeyDecisionUniqueId = ?",
        [driverOutcomeStatusId, currentDate(), assignment.journeyDecisionUniqueId],
      );
      // Terminal only an ACTIVE journey (1-8). A journey that already completed
      // or was cancelled keeps its outcome — a rejection never rewrites it.
      await db().query(
        `UPDATE Journey
            SET journeyStatusId = ?
          WHERE journeyDecisionUniqueId = ?
            AND journeyStatusId IN (1, 2, 3, 4, 5, 6, 7, 8)`,
        [driverOutcomeStatusId, assignment.journeyDecisionUniqueId],
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

    // ── Repeated pre-confirm rejection policy (per batch) ────────────────────
    // 1st pre-confirm rejection (`rejected_by_driver`): vehicle stays active.
    // 2nd pre-confirm rejection by the same driver in the same
    // `shipperRequestBatchUniqueId`: inactivate the vehicle (dispatcher re-free).
    // Assignment row is not yet updated in this PATCH flow, so exclude it and
    // treat current action as +1.
    if (assignmentStatus === "rejected_by_driver") {
      await maybeInactivateVehicleOnRepeatedPreconfirmRejection({
        executor: db(),
        assignmentUniqueId,
        excludeAssignmentUniqueId: assignmentUniqueId,
        driverUserUniqueId: assignment.driverUserUniqueId,
        vehicleUniqueId: assignment.vehicleUniqueId,
      }).catch((e) =>
        logger.warn("Repeated pre-confirm rejection vehicle inactivation failed", {
          error: e.message,
          assignmentUniqueId,
        }),
      );
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
  return assignmentStatus;
};

module.exports.handleDriverRejectionOrCancellation = handleDriverRejectionOrCancellation;
