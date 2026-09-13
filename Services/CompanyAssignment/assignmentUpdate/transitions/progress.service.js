"use strict";

const { currentDate } = require("../../../../Utils/CurrentDate");
const AppError = require("../../../../Utils/AppError");
const { db } = require("../../../CompanyHelper.service");
const { journeyStatusMap, usersRoles } = require("../../../../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("../../../Firebase.service");
const logger = require("../../../../Utils/logger");
const messageTypes = require("../../../../Utils/MessageTypes");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToShipper,
} = require("../../../../Utils/Notifications");
const { getCompanyUniqueId, getShipperContact } = require("../helpers");

const handleJourneyProgressSync = async ({
  assignment,
  assignmentStatus,
  assignmentUniqueId,
  fullAssignment,
}) => {
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
};

module.exports.handleJourneyProgressSync = handleJourneyProgressSync;
