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
  return assignmentStatus;
};

module.exports.handleDriverRejectionOrCancellation = handleDriverRejectionOrCancellation;
