"use strict";



/**
 * ### Atomically cancel an entire company-targeted freight batch.
 *
 * **What is updated in one DB transaction:**
 *
 * | Table                          | What changes                                                  |
 * |-------------------------------|---------------------------------------------------------------|
 * | ShipperRequestBatch          | journeyStatusId → 7 (cancelledByShipper) or 10 (Admin)      |
 * | ShipperRequest               | All rows in this batch → same cancelled status                |
 * | JourneyDecisions               | All open decisions for those requests → same cancelled status |
 * | DriverRequest                  | Matched drivers released back to waiting (status 1)           |
 * | CompanyBidRequest              | All submitted bids → 'expired'                                |
 * | CompanyBidVehicleAssignment    | All assignments → 'cancelled'                                 |
 *
 * **Why this approach?**
 * Sending N individual HTTP cancel calls from the client is wasteful and risks
 * partial failure.  One atomic transaction guarantees either everything cancels
 * or nothing does.
 *
 * **Junior Note — terminal statuses guard:**
 * `journeyStatusId NOT IN (7,9,10,12)` prevents re-cancelling rows that are
 * already in a terminal state (e.g. a driver independently cancelled their side).
 *
 * @param {string} batchUniqueId            - UUID of the batch to cancel.
 * @param {string} userUniqueId             - Authenticated user's UUID.
 * @param {number} roleId                   - Authenticated user's role ID.
 * @param {number|null} cancellationReasonsTypeId - Optional reason FK.
 */

const sendBatchCancelNotifications = async ({
  batchUniqueId,
  cancelStatusId,
  companies,
  drivers,
  shipper
}) => {
  const cancelMsg = cancelStatusId === journeyStatusMap.cancelledByAdmin ? messageTypes.admin_cancelled_request : messageTypes.shipper_cancelled_request;
  const socketPayload = {
    messageTypes: messageTypes.company_bid_cancelled,
    message: "success",
    status: cancelStatusId,
    batchUniqueId
  };
  const promises = [];

  // ── Notify each company (WebSocket to all active members + FCM push) ─────
  for (const companyUniqueId of companies) {
    // WebSocket
    promises.push(sendSocketIONotificationToCompany({
      companyUniqueId,
      message: socketPayload
    }).catch(err => logger.warn("cancelBatch: company socket error", {
      companyUniqueId,
      error: err.message
    })));
  }

  // ── Notify each driver that had a decision on this batch ───────────────
  for (const {
    phoneNumber,
    userUniqueId
  } of drivers) {
    const driverPayload = {
      messageTypes: cancelMsg,
      message: "success",
      status: cancelStatusId,
      batchUniqueId
    };

    // WebSocket
    promises.push(sendSocketIONotificationToDriver({
      message: driverPayload,
      phoneNumber,
      userType: "driver"
    }).catch(err => logger.warn("cancelBatch: driver socket error", {
      userUniqueId,
      error: err.message
    })));

    // FCM push
    promises.push(sendFCMNotificationToUser({
      userUniqueId,
      roleId: 2,
      // driver role
      notification: {
        title: "Request cancelled",
        body: "The shipper has cancelled the freight batch."
      },
      data: {
        type: "batch_cancelled",
        batchUniqueId: String(batchUniqueId)
      }
    }).catch(err => logger.warn("cancelBatch: driver FCM error", {
      userUniqueId,
      error: err.message
    })));
  }

  // ── Notify the shipper on any other open devices ───────────────────────
  if (shipper?.phoneNumber) {
    const shipperPayload = {
      messageTypes: cancelMsg,
      message: "success",
      status: cancelStatusId,
      batchUniqueId
    };

    // WebSocket (catches the case where another device/tab is open)
    promises.push(sendSocketIONotificationToShipper({
      message: shipperPayload,
      phoneNumber: shipper.phoneNumber
    }).catch(err => logger.warn("cancelBatch: shipper socket error", {
      userUniqueId: shipper.userUniqueId,
      error: err.message
    })));

    // FCM push (wakes up app if in background)
    promises.push(sendFCMNotificationToUser({
      userUniqueId: shipper.userUniqueId,
      roleId: 1,
      // shipper/shipper role
      notification: {
        title: "Batch cancelled",
        body: "Your freight batch has been cancelled successfully."
      },
      data: {
        type: "batch_cancelled",
        batchUniqueId: String(batchUniqueId)
      }
    }).catch(err => logger.warn("cancelBatch: shipper FCM error", {
      userUniqueId: shipper.userUniqueId,
      error: err.message
    })));
  }
  await Promise.allSettled(promises);
};

module.exports = {
  sendBatchCancelNotifications
};


const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const messageTypes = require("../../../Utils/MessageTypes");
const { sendSocketIONotificationToCompany } = require("../../../Utils/Notifications");
const logger = require("../../../Utils/logger");
const { sendSocketIONotificationToDriver } = require("../../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../../../Utils/Notifications");
const { sendSocketIONotificationToShipper } = require("../../../Utils/Notifications");