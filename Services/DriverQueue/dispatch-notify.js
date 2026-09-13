"use strict";

const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSms } = require("../../Utils/smsSender");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const { QUEUE_OFFER_WINDOW_MINUTES } = require("./helpers");

/**
 * Notify a driver of a queue order offer via socket, FCM, and SMS.
 *
 * Called after a pending order is matched to the front-of-queue driver. The
 * notification is sent through three channels:
 * - **Socket**: real-time push to the driver's connected client.
 * - **FCM**: wake the driver's phone even when the app is backgrounded.
 * - **SMS**: fallback if the driver is offline.
 *
 * Best-effort: if any channel fails, the error is logged but not thrown.
 * The driver's `myPosition` poll and socket reconnect will recover the offer
 * independently.
 *
 * @param {Object} params
 * @param {Object} params.front - The front-of-queue driver entry (DriverQueue row).
 * @param {Object} params.shipperRequest - The order being offered.
 * @param {Object} params.vehicle - The driver's vehicle info.
 * @param {Object} params.offerResult - The offer result from the dispatch logic.
 * @returns {Promise<void>}
 */
const notifyDriverOfQueueOffer = async ({
  front,
  shipperRequest,
  vehicle,
  offerResult,
}) => {
  if (!front?.phoneNumber) return;
  // FCM — wakes the driver's phone even when the app is backgrounded, so a
  // queue placement rings like a company assignment / nearby-match offer
  // instead of being silently missed. Best-effort: the socket is the primary
  // path, and the driver app's REST myPosition poll recovers the offer anyway.
  sendFCMNotificationToUser({
    userUniqueId: front.driverUserUniqueId,
    roleId: usersRoles.driverRoleId,
    notification: {
      title: "New queue order offered",
      body: shipperRequest?.originPlace
        ? `You have a new queue order from ${shipperRequest.originPlace}. Please accept or reject.`
        : "You have a new queue order. Please accept or reject.",
    },
    data: {
      type: "queue_order_offered",
      queueOrganizationUniqueId: front.queueOrganizationUniqueId,
      queueUniqueId: front.queueUniqueId,
      queueNumber: String(front.queueNumber ?? ""),
      shipperRequestUniqueId: shipperRequest.shipperRequestUniqueId,
      journeyDecisionUniqueId: offerResult.decision.journeyDecisionUniqueId,
    },
  }).catch((e) =>
    logger.error("FCM failed for queue offer notification", {
      error: e.message,
      driverUserUniqueId: front.driverUserUniqueId,
      queueUniqueId: front.queueUniqueId,
    }),
  );

  try {
    await sendSocketIONotificationToDriver({
      phoneNumber: front.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes.queue_order_offered,
        message: "New queue order offered",
        status: journeyStatusMap.requested,
        shipper: shipperRequest,
        driver: {
          driver: {
            ...front,
            driverRequestUniqueId: offerResult.decision.driverRequestUniqueId,
          },
          vehicle,
        },
        journey: null,
        decisions: offerResult.decision,
        queue: {
          queueOrganizationUniqueId: front.queueOrganizationUniqueId,
          queueUniqueId: front.queueUniqueId,
          queueNumber: front.queueNumber,
          offerWindowMinutes: QUEUE_OFFER_WINDOW_MINUTES,
        },
      },
    });
  } catch (socketErr) {
    logger.error("Socket notification failed for queue offer", {
      error: socketErr.message,
      driverUserUniqueId: front.driverUserUniqueId,
      queueUniqueId: front.queueUniqueId,
    });
  }
};
/**
 * Push a `queue` socket event to the SHIPPER who owns a queue order. The
 * shipper is resolved via `ShipperRequest.shipperRequestCreatedBy → Users`.
 * Mirrors `notifyDriverOfQueueOffer`; the bid flow already uses this helper
 * (`sendSocketIONotificationToShipper`). Best-effort: offline shipper or an
 * order created by a queue admin (no `shipper` socket) is skipped silently —
 * the QueueOrgAdmin rooms still get the snapshot push.
 */
const notifyShipperOfQueueEvent = async ({
  executor,
  shipperRequestUniqueId,
  messageType,
  message,
  data = {},
}) => {
  try {
    const [rows] = await executor.query(
      `SELECT u.phoneNumber, u.fullName
       FROM ShipperRequest sr
       JOIN Users u ON u.userUniqueId = sr.shipperRequestCreatedBy
       WHERE sr.shipperRequestUniqueId = ? AND sr.shipperRequestDeletedAt IS NULL`,
      [shipperRequestUniqueId],
    );
    const shipper = rows[0];
    if (!shipper?.phoneNumber) return;
    await sendSocketIONotificationToShipper({
      phoneNumber: shipper.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes[messageType],
        message,
        shipperRequestUniqueId,
        shipper: {
          fullName: shipper.fullName,
          phoneNumber: shipper.phoneNumber,
        },
        ...data,
      },
    });
  } catch (error) {
    logger.error("notifyShipperOfQueueEvent failed", {
      error: error.message,
      shipperRequestUniqueId,
    });
  }
};
/**
 * Notify a shipper that a driver has reserved their queue position exclusively
 * for the shipper's orders. Best-effort: socket + FCM + SMS, failures are
 * logged but never block the checkin.
 */
const notifyShipperOfQueueReservation = async ({
  executor,
  targetedShipperUserUUID,
  driverFullName,
  driverPhoneNumber,
  queueOrganizationUniqueId,
  queueNumber,
}) => {
  if (!targetedShipperUserUUID) return;
  try {
    const [rows] = await executor.query(
      `SELECT phoneNumber, fullName FROM Users WHERE userUniqueId = ? AND isDeleted = 0 LIMIT 1`,
      [targetedShipperUserUUID],
    );
    const shipper = rows[0];
    if (!shipper?.phoneNumber) return;

    // Socket notification
    sendSocketIONotificationToShipper({
      phoneNumber: shipper.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes.queue_position_reserved,
        message: "A driver has reserved their queue position for your orders",
        data: {
          targetedShipperUserUUID,
          driverFullName,
          driverPhoneNumber,
          queueOrganizationUniqueId,
          queueNumber,
        },
      },
    }).catch((e) =>
      logger.error("Socket notification failed for queue reservation", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );

    // FCM notification
    sendFCMNotificationToUser({
      userUniqueId: targetedShipperUserUUID,
      roleId: usersRoles.shipperRoleId,
      notification: {
        title: "Queue position reserved",
        body: driverFullName
          ? `Driver ${driverFullName} has reserved their queue position for your orders.`
          : "A driver has reserved their queue position for your orders.",
      },
      data: {
        type: "queue_position_reserved",
        targetedShipperUserUUID,
        driverFullName,
        driverPhoneNumber,
        queueOrganizationUniqueId,
        queueNumber: String(queueNumber ?? ""),
      },
    }).catch((e) =>
      logger.error("FCM failed for queue reservation notification", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );

    // SMS notification
    sendSms(
      shipper.phoneNumber,
      null,
      `A driver has reserved their queue position for your orders. Driver: ${driverFullName || "N/A"}, Phone: ${driverPhoneNumber || "N/A"}.`,
    ).catch((e) =>
      logger.error("SMS failed for queue reservation notification", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );
  } catch (error) {
    logger.error("notifyShipperOfQueueReservation failed", {
      error: error.message,
      targetedShipperUserUUID,
    });
  }
};

module.exports = {
  notifyDriverOfQueueOffer,
  notifyShipperOfQueueEvent,
  notifyShipperOfQueueReservation,
};
