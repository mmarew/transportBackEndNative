"use strict";

const { db } = require("../../CompanyHelper.service");
const {
  journeyStatusMap,
  usersRoles,
} = require("../../../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("../../Firebase.service");
const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToCompany,
} = require("../../../Utils/Notifications");
const messageTypes = require("../../../Utils/MessageTypes");
const logger = require("../../../Utils/logger");
const {
  verifyDriverJourneyStatus,
} = require("../../DriverRequest/statusVerification");
const { getFullAssignmentData } = require("./read.service");

/**
 * Sends both FCM + WebSocket notification to an assigned driver.
 * Used by createAssignment, createBulkAssignments, and autoAssignBatch
 * so all three paths behave identically.
 *
 * @param {Object} opts
 * @param {string} opts.driverUserUniqueId
 * @param {string} opts.assignmentUniqueId
 * @param {string} opts.driverRequestUniqueId
 * @param {string} opts.shipperRequestUniqueId
 * @param {string} opts.companyBidRequestUniqueId
 */

const notifyAssignedDriver = async (opts) => {
  const {
    driverUserUniqueId,
    assignmentUniqueId,
    driverRequestUniqueId,
    shipperRequestUniqueId,
    companyBidRequestUniqueId,
  } = opts;

  const notificationData = {
    type: "company_driver_assignment",
    assignmentUniqueId,
    driverRequestUniqueId,
    shipperRequestUniqueId,
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
      // would receive on the next poll — includes shipper, decision, companyAssignment.
      let wsPayload;
      try {
        const statusResult = await verifyDriverJourneyStatus({
          userUniqueId: driverUserUniqueId,
        });
        wsPayload = {
          messageTypes: messageTypes.company_driver_assignment,
          message: "Assignment helper operation completed",
          ...statusResult, // status, driver, shipper, decision, journey, companyAssignment
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
          message: "Assignment helper operation completed",
          status: journeyStatusMap.requested,
          companyAssignment: {
            assignmentUniqueId,
            driverRequestUniqueId,
            shipperRequestUniqueId,
            companyBidRequestUniqueId,
          },
          driver: null,
          shipper: null,
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
 * ### Notify company + dispatcher when a driver acts on a company assignment.
 *
 * Queries `CompanyBidVehicleAssignment` for the given `shipperRequestUniqueId`.
 * If found (company-targeted), sends:
 *   - FCM to the dispatcher who created the assignment
 *   - WebSocket to all online company members
 *
 * If no company assignment exists (individual flow), returns silently — no-op.
 *
 * @param {Object} opts
 * @param {string} opts.shipperRequestUniqueId
 * @param {string} [opts.driverName=""]  — driver display name for notification body
 * @param {string} opts.action           — one of:
 *   'started_journey' | 'completed_journey' | 'cancelled_by_driver' | 'rejected_by_driver'
 */

const notifyCompanyOnDriverAction = async ({
  shipperRequestUniqueId,
  driverName = "",
  action,
}) => {
  if (!shipperRequestUniqueId || !action) return;

  try {
    const [[assignment]] = await db().query(
      `SELECT cba.assignmentUniqueId, cba.companyBidRequestUniqueId,
              cba.assignmentCreatedBy, cbr.companyUniqueId
       FROM CompanyBidVehicleAssignment cba
       JOIN CompanyBidRequest cbr ON cba.companyBidRequestUniqueId = cbr.companyBidRequestUniqueId
       WHERE cba.shipperRequestUniqueId = ?
         AND cba.assignmentDeletedAt IS NULL
       LIMIT 1`,
      [shipperRequestUniqueId],
    );

    if (!assignment) return;

    // Fetch full record matching GET /api/company/assignments response shape
    const fullAssignment = await getFullAssignmentData(assignment.assignmentUniqueId);

    const actionConfig = {
      going_to_loading_place: {
        title: "Driver going to loading point",
        body: `Driver ${driverName} is on the way to the loading place.`,
        type: "driver_going_to_loading_place",
        messageType: messageTypes.company_driver_going_to_loading,
      },
      started_loading: {
        title: "Driver started loading",
        body: `Driver ${driverName} started loading at the loading place.`,
        type: "driver_started_loading",
        messageType: messageTypes.company_driver_started_loading,
      },
      completed_loading: {
        title: "Driver completed loading",
        body: `Driver ${driverName} completed loading and is ready to depart.`,
        type: "driver_completed_loading",
        messageType: messageTypes.company_driver_completed_loading,
      },
      started_journey: {
        title: "Driver started journey",
        body: `Driver ${driverName} has started the journey.`,
        type: "driver_started_journey",
        messageType: messageTypes.company_driver_journey_started,
      },
      completed_journey: {
        title: "Driver completed journey",
        body: `Driver ${driverName} has completed the journey.`,
        type: "driver_completed_journey",
        messageType: messageTypes.company_driver_completed,
      },
      cancelled_by_driver: {
        title: "Driver cancelled journey",
        body: `Driver ${driverName} cancelled the journey on your freight batch.`,
        type: "driver_cancelled_journey",
        messageType: messageTypes.company_driver_cancelled,
      },
      rejected_by_driver: {
        title: "Driver rejected assignment",
        body: `Driver ${driverName} rejected the freight assignment.`,
        type: "driver_rejected_assignment",
        messageType: messageTypes.company_driver_rejected,
      },
    };

    const config = actionConfig[action];
    if (!config) {
      logger.warn("Unknown company notification action", { action });
      return;
    }

    const companyNotif = { title: config.title, body: config.body };
    const companyData = fullAssignment || {
      type: config.type,
      assignmentUniqueId: assignment.assignmentUniqueId,
      shipperRequestUniqueId,
      companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
    };

    // FCM to the dispatcher / company admin who created the assignment
    sendFCMNotificationToUser({
      userUniqueId: assignment.assignmentCreatedBy,
      roleId: usersRoles.companyAdminRoleId,
      notification: companyNotif,
      data: companyData,
    }).catch((e) =>
      logger.error("FCM failed for company on driver action", {
        error: e.message,
        action,
        shipperRequestUniqueId,
      }),
    );

    // WebSocket to all online company members
    sendSocketIONotificationToCompany({
      companyUniqueId: assignment.companyUniqueId,
      message: {
        messageTypes: config.messageType,
        message: `Driver action: ${action}`,
        notification: companyNotif,
        data: companyData,
      },
    }).catch((e) =>
      logger.warn("WebSocket to company failed on driver action", {
        error: e.message,
        action,
        companyUniqueId: assignment.companyUniqueId,
      }),
    );
  } catch (e) {
    logger.error("Failed to notify company on driver action", {
      error: e.message,
      action,
      shipperRequestUniqueId,
    });
  }
};

module.exports.notifyAssignedDriver = notifyAssignedDriver;
module.exports.notifyCompanyOnDriverAction = notifyCompanyOnDriverAction;
