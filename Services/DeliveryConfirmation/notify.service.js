"use strict";

const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");
const logger = require("../../Utils/logger");

// After a POD is submitted, notify the journey's shipper via WebSocket AND FCM
// so they can review & sign without polling. Best-effort: failures are logged,
// never thrown.
exports.notifyShipperOfPodSubmit = async (
  journeyUniqueId,
  deliveryConfirmationUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const [rows] = await executor.query(
      `SELECT sr.userUniqueId AS shipperUserUniqueId,
              sr.shipperRequestId,
              u.phoneNumber AS shipperPhoneNumber
       FROM Journey j
       JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       LEFT JOIN Users u ON u.userUniqueId = sr.userUniqueId
       WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
       LIMIT 1`,
      [journeyUniqueId],
    );
    const shipperUserUniqueId = rows[0]?.shipperUserUniqueId;
    if (!shipperUserUniqueId) {
      logger.warn("POD shipper notification skipped: no shipper for journey", {
        journeyUniqueId,
      });
      return { message: "No shipper found for journey; skipping notification" };
    }

    // Real-time WebSocket push → the shipper app opens the POD review screen.
    const phoneNumber = rows[0]?.shipperPhoneNumber;
    if (phoneNumber) {
      const wsResult = await sendSocketIONotificationToShipper({
        phoneNumber,
        message: {
          messageTypes: messageTypes.pod_submitted,
          message: "POD submitted.",
          data: {
            journeyUniqueId,
            deliveryConfirmationUniqueId,
            shipperRequestId: rows[0]?.shipperRequestId,
          },
        },
      });
      if (wsResult?.status !== "success") {
        logger.warn("POD WS push skipped for shipper", {
          journeyUniqueId,
          reason: wsResult?.data || wsResult?.message,
        });
      }
    }

    return await sendFCMNotificationToUser({
      userUniqueId: shipperUserUniqueId,
      roleId: usersRoles.shipperRoleId,
      notification: {
        title: "Proof of delivery submitted",
        body: "A driver has submitted proof of delivery. Review and sign it.",
      },
      data: { journeyUniqueId },
    });
  } catch (error) {
    logger.warn("POD shipper notification failed", {
      journeyUniqueId,
      error: error.message,
    });
    return { message: "Notification skipped" };
  }
};

// Notify the driver that the shipper confirmed the POD directly (no driver
// evidence was needed), so their POD gate clears immediately instead of on the
// next app open / poll. Best-effort — never fails the create request.
exports.notifyDriverOfPodConfirmed = async (
  journeyUniqueId,
  deliveryConfirmationUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const [rows] = await executor.query(
      `SELECT dr.userUniqueId AS driverUserUniqueId,
              u.phoneNumber AS driverPhoneNumber
       FROM Journey j
       JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
       LEFT JOIN Users u ON u.userUniqueId = dr.userUniqueId
       WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
       LIMIT 1`,
      [journeyUniqueId],
    );
    const driverUserUniqueId = rows[0]?.driverUserUniqueId;
    if (!driverUserUniqueId) {
      logger.warn("POD driver notification skipped: no driver for journey", {
        journeyUniqueId,
      });
      return { message: "No driver found for journey; skipping notification" };
    }

    // Real-time WebSocket push → the driver app clears the POD gate.
    const phoneNumber = rows[0]?.driverPhoneNumber;
    if (phoneNumber) {
      const wsResult = await sendSocketIONotificationToDriver({
        phoneNumber,
        message: {
          messageTypes: messageTypes.pod_confirmed,
          message: "POD confirmed.",
          data: {
            journeyUniqueId,
            deliveryConfirmationUniqueId,
          },
        },
      });
      if (wsResult?.status !== "success") {
        logger.warn("POD WS push skipped for driver", {
          journeyUniqueId,
          reason: wsResult?.data || wsResult?.message,
        });
      }
    }

    return await sendFCMNotificationToUser({
      userUniqueId: driverUserUniqueId,
      roleId: usersRoles.driverRoleId,
      notification: {
        title: "Proof of delivery confirmed",
        body: "The shipper has confirmed delivery of your journey's goods. You're free for new trips.",
      },
      data: { journeyUniqueId },
    });
  } catch (error) {
    logger.warn("POD driver notification failed", {
      journeyUniqueId,
      error: error.message,
    });
    return { message: "Notification skipped" };
  }
};

// Notify the shipper that the driver confirmed delivery (settled the POD with
// the shipper's signature). Best-effort — never fails the settle request.
exports.notifyShipperOfPodConfirmed = async (
  journeyUniqueId,
  deliveryConfirmationUniqueId,
) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const [rows] = await executor.query(
      `SELECT sr.userUniqueId AS shipperUserUniqueId,
              sr.shipperRequestId,
              u.phoneNumber AS shipperPhoneNumber
       FROM Journey j
       JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       LEFT JOIN Users u ON u.userUniqueId = sr.userUniqueId
       WHERE j.journeyUniqueId = ? AND j.journeyDeletedAt IS NULL
       LIMIT 1`,
      [journeyUniqueId],
    );
    const shipperUserUniqueId = rows[0]?.shipperUserUniqueId;
    if (!shipperUserUniqueId) {
      logger.warn("POD shipper notification skipped: no shipper for journey", {
        journeyUniqueId,
      });
      return { message: "No shipper found for journey; skipping notification" };
    }

    // Real-time WebSocket push → the shipper app shows POD completion.
    const phoneNumber = rows[0]?.shipperPhoneNumber;
    if (phoneNumber) {
      const wsResult = await sendSocketIONotificationToShipper({
        phoneNumber,
        message: {
          messageTypes: messageTypes.pod_confirmed_by_driver,
          message: "Delivery confirmed by shipper on driver device.",
          data: {
            journeyUniqueId,
            deliveryConfirmationUniqueId,
            shipperRequestId: rows[0]?.shipperRequestId,
          },
        },
      });
      if (wsResult?.status !== "success") {
        logger.warn("POD WS push skipped for shipper", {
          journeyUniqueId,
          reason: wsResult?.data || wsResult?.message,
        });
      }
    }

    return await sendFCMNotificationToUser({
      userUniqueId: shipperUserUniqueId,
      roleId: usersRoles.shipperRoleId,
      notification: {
        title: "Delivery confirmed",
        body: "The driver has submitted your signed proof of delivery. POD is complete.",
      },
      data: { journeyUniqueId },
    });
  } catch (error) {
    logger.warn("POD shipper notification failed", {
      journeyUniqueId,
      error: error.message,
    });
    return { message: "Notification skipped" };
  }
};
