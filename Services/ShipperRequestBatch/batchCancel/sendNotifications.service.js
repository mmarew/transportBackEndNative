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

  // Fetch full batch record matching GET /api/company/bids batch shape
  let fullBatch = null;
  try {
    const [[batch]] = await db().query(
      `SELECT b.batchUniqueId,
              b.batchUniqueId AS shipperRequestBatchId,
              b.batchId,
              b.originPlace, b.originLatitude, b.originLongitude,
              b.destinationPlace, b.destinationLatitude, b.destinationLongitude,
              b.shippableItemName, b.shippableItemQtyInQuintal,
              b.totalVehicles,
              b.shippingCost AS batchShippingCost,
              b.shippingDate AS batchShippingDate,
              b.deliveryDate AS batchDeliveryDate,
              b.journeyStatusId, b.requestMode, b.batchCreatedAt,
              u.fullName AS shipperName,
              vt.vehicleTypeName,
              js.journeyStatusName
       FROM ShipperRequestBatch b
       LEFT JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
       LEFT JOIN VehicleTypes vt ON b.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
       LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
       WHERE b.batchUniqueId = ? LIMIT 1`,
      [batchUniqueId],
    );
    fullBatch = batch;
  } catch (e) {
    logger.warn("Failed to fetch batch for cancel notification", { error: e.message, batchUniqueId });
  }

  const socketPayload = {
    messageTypes: messageTypes.company_bid_cancelled,
    message: "success",
    notification: {
      title: "Bid Cancelled",
      body: "The freight batch has been cancelled."
    },
    data: fullBatch || {
      batchUniqueId,
      cancelStatusId,
    },
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
      notification: {
        title: "Request cancelled",
        body: "The freight batch has been cancelled."
      },
      data: {
        status: cancelStatusId,
        batchUniqueId
      }
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
      notification: {
        title: "Batch cancelled",
        body: "Your freight batch has been cancelled."
      },
      data: {
        status: cancelStatusId,
        batchUniqueId
      }
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


const { db } = require("../../../Services/CompanyHelper.service");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const messageTypes = require("../../../Utils/MessageTypes");
const { sendSocketIONotificationToCompany } = require("../../../Utils/Notifications");
const logger = require("../../../Utils/logger");
const { sendSocketIONotificationToDriver } = require("../../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../../../Utils/Notifications");
const { sendSocketIONotificationToShipper } = require("../../../Utils/Notifications");