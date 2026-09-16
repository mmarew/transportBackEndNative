// Utils/Notifications.js
//
// Stakeholder notification helpers — how to push live (socket.io) and offline
// (FCM) messages to shipper, company, driver and queue loading place during
// the freight flow. Every helper here returns a Promise and never throws; call
// them AFTER the DB commit (fire-and-forget with .catch(logger.error) so a
// heartbeat hiccup never breaks the REST write).

/**
 * ── Channels at a glance ────────────────────────────────────────────────────
 * Per-user socket   `getSocket("{userType}:{digitsOnlyPhone}") -> socketId`,
 *                   then `emitMessage({socketId, eventName, messageDetails})`.
 *                   Used for a single stakeholder (shipper, company member,
 *                   driver, queue staff). Redis key = userType + digits-only
 *                   phone (see Utils/WsConnectionStore.js, SocketUserTypes).
 * Org room broadcast `io.to(orgRoom(uid)) -> "queueOrg:<queueOrganizationUniqueId>"`
 *                   Any subscribed client of a queue org (drivers + staff).
 * Day room broadcast `io.to(dayRoom(uid, date)) -> "queueOrg:<uid>:<YYYY-MM-DD>"`
 *                   Queue-position changes for a specific queue day.
 * FCM               `sendFCMNotificationToUser({userUniqueId, roleId, ...})`
 *                   Background/killed apps. Pair socket + FCM for the actor
 *                   whose device must wake (e.g. shipper); queue loading place
 *                   events are socket-ONLY (live screens, offline staff poll).
 *
 * Socket user types (Utils/SocketUserTypes.js): driver · shipper · SMSSender ·
 * admin · company · queueOrgAdmin.
 *
 * ── Message envelope (what every client receives) ──────────────────────────
 *   {
 *     "message": "success",
 *     "messageTypes": { "message": "...", "details": "..." },
 *     "notification": { "title": "...", "body": "..." },      // FCM only
 *     "data": { "type": "...", ...any screen payload... }
 *   }
 *
 * ── Company-targeted flow — who hears what (socket / FCM) ───────────────────
 * Batch created (PRs deferred)        : targeted companies ← company_batch_available
 * Company submits bid                 : shipper ← company_bid_submitted;
 *                                       queue org ← company_bid_joined (room+staff)
 * Winning bid accepted                : shipper (FCM+socket); company ←
 *                                       company_bid_accepted; queue org ←
 *                                       company_selected (socket-only)
 * Losing bids                         : company ← company_bid_not_selected
 * Driver assigned                     : driver ← company_driver_assignment
 * Driver confirms (confirmed_by_driver): shipper + company ← company_driver_confirmed;
 *                                       queue loading place ←
 *                                       queue_driver_confirmed_assignment (socket-only)
 * Loading stages (5/6/7)              : queue org ← notifyQueueOrgOfLoadingStage
 *                                       (room + staff, socket-only)
 *
 * Helpers here target shipper / company / admin / driver one-at-a-time.
 * See Utils/QueueSocket.js for queue-org room + staff helpers. Message type
 * metadata lives in Utils/MessageTypes.js; FCM lives in
 * Services/Firebase.service.js (sendFCMNotificationToUser).
 */
const { emitMessage } = require("./WsServerResponder");
const { getSocket } = require("./WsConnectionStore");
const { redis } = require("../Config/redis.config");
const logger = require("./logger");
const AppError = require("./AppError");
const { db } = require("../Services/CompanyHelper.service");
const { SocketUserTypes } = require("./SocketUserTypes");

// Regular expression to validate phone numbers (only digits, between 9 and 15 digits)
const phoneNumberRegex = /^[0-9]{9,15}$/;

// Clean phone number by removing non-digit characters
const cleanPhoneNumber = (phoneNumber) => {
  return phoneNumber?.replace(/\D/g, "");
};

// 🔔 Notify a specific driver by phone number
const sendSocketIONotificationToDriver = async ({
  message,
  phoneNumber,
  eventName,
  userType = SocketUserTypes.DRIVER,
}) => {
  const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);
  if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
    logger.warn("Skipping driver notification: invalid or missing phone number", {
      phoneNumber: cleanedPhoneNumber,
    });
    return {
      status: "error",
      message: "Invalid phone number format",
      skipped: true,
    };
  }

  try {
    logger.debug("@sendSocketIONotificationToDriver", {
      messageTypes: message.messageTypes,
      phoneNumber,
    });

    const socketId = await getSocket(userType, cleanedPhoneNumber);
    if (!socketId) {
      logger.warn("No active driver socket found for notification", {
        phoneNumber: cleanedPhoneNumber,
      });
      return {
        status: "success",
        message: "success",
        data: "Notification skipped: Driver offline",
      };
    }

    const res = await emitMessage({
      eventName: eventName || "messages",
      messageDetails: JSON.stringify(message),
      socketId,
    });

    if (res.status === "success" || res.message === "success") {
      return { status: "success", data: "Message sent to driver" };
    } else {
      logger.error("Failed to send message to driver", { res });
      return { status: "error", message: "Failed to send message to driver" };
    }
  } catch (error) {
    logger.warn("Error sending notification to driver", {
      error: error.message,
      stack: error.stack,
    });
    return {
      status: "error",
      message: "Request can't be sent to driver",
    };
  }
};

// 🔔 Notify a specific shipper by phone number
const sendSocketIONotificationToShipper = async ({
  message,
  phoneNumber,
  eventName,
  userType = SocketUserTypes.SHIPPER,
}) => {
  const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);
  if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
    logger.warn("Skipping shipper notification: invalid or missing phone number", {
      phoneNumber: cleanedPhoneNumber,
    });
    return {
      status: "error",
      message: "Invalid phone number format",
      skipped: true,
    };
  }

  try {
    logger.debug("@sendSocketIONotificationToShipper", {
      phoneNumber,
      eventName: eventName || "messages",
    });
    const socketId = await getSocket(userType, cleanedPhoneNumber);
    if (!socketId) {
      logger.warn("No active shipper socket found for notification", {
        phoneNumber: cleanedPhoneNumber,
      });
      return {
        status: "success",
        message: "success",
        data: "Notification skipped: Shipper offline",
      };
    }
    logger.debug("@sendSocketIONotificationToShipper: found socket, emitting", {
      socketId,
      phoneNumber: cleanedPhoneNumber,
    });
    const res = await emitMessage({
      eventName: eventName || "messages",
      messageDetails: JSON.stringify(message),
      socketId,
    });

    if (res.status === "success" || res.message === "success") {
      return { status: "success", data: "Message sent to shipper" };
    } else {
      logger.error("Failed to send message to shipper", { res });
      return {
        status: "error",
        message: "Failed to send message to shipper",
      };
    }
  } catch (error) {
    logger.warn("Error sending notification to shipper", {
      error: error.message,
      stack: error.stack,
    });
    return {
      status: "error",
      message: "Message can't be sent to shipper",
    };
  }
};

const sendSocketIONotificationToAdmin = async ({ message, eventName }) => {
  if (!redis) {
    logger.warn("Redis not available for admin notification");
    return { status: "error", message: "Redis not available" };
  }
  try {
    let keys = [];
    try {
      keys = await redis.keys(`${SocketUserTypes.ADMIN}:*`);
    } catch (redisError) {
      logger.error("Redis connection error", {
        error: redisError.message,
        stack: redisError.stack,
      });
      return {
        status: "error",
        message: "Redis connection error - unable to send admin notifications",
      };
    }

    const successList = [];
    const errorList = [];

    for (const key of keys) {
      let socketId = null;
      try {
        socketId = await redis.get(key);
      } catch (redisError) {
        logger.error("Redis error while fetching socket", {
          key,
          error: redisError.message,
          stack: redisError.stack,
        });
        // Skip this key if Redis error occurs
        errorList.push({
          key,
          status: "error",
          detail: "Redis error while fetching socket",
        });
        continue;
      }

      if (!socketId) {
        continue;
      }

      try {
        const res = await emitMessage({
          eventName: eventName || "messages",
          messageDetails: JSON.stringify(message),
          socketId,
        });

        if (res.status === "success" || res.message === "success") {
          successList.push({
            socketId,
            status: "success",
            detail: "Message sent to admin",
          });
        } else {
          errorList.push({
            socketId,
            status: "error",
            detail: "Failed to send message to admin",
          });
        }
      } catch (err) {
        logger.error("Exception while sending to admin", {
          socketId,
          error: err.message,
          stack: err.stack,
        });
        errorList.push({
          socketId,
          status: "error",
          detail: "Exception while sending to admin",
        });
      }
    }

    if (successList.length === 0) {
      logger.warn("No admin message was sent", { errorList });
      return { status: "error", message: "No admin message was sent" };
    }

    return {
      status: "success",
    };
  } catch (error) {
    logger.error("Internal error sending notifications", {
      error: error.message,
      stack: error.stack,
    });
    return {
      status: "error",
      message: "Internal error sending notifications",
    };
  }
};

// 🔔 Notify company admin(s) via WebSocket
const sendSocketIONotificationToCompany = async ({
  companyUniqueId,
  phoneNumber,
  message,
  eventName,
  userType = SocketUserTypes.COMPANY,
}) => {
  try {
    const targets = [];

    if (phoneNumber) {
      targets.push(phoneNumber);
    } else if (companyUniqueId) {
      const [members] = await db().query(
        `SELECT u.phoneNumber
         FROM CompanyMembership cm
         JOIN Users u ON cm.userUniqueId = u.userUniqueId
         WHERE cm.companyUniqueId = ?
           AND cm.isActive = 1
           AND cm.membershipDeletedAt IS NULL`,
        [companyUniqueId],
      );
      if (members && members.length > 0) {
        targets.push(...members.map((m) => m.phoneNumber));
      }
    }

    if (targets.length === 0) {
      logger.debug("No targets found for company notification", {
        companyUniqueId,
        phoneNumber,
      });
      return { status: "success", data: "No targets to notify" };
    }

    const results = [];
    for (const targetPhone of targets) {
      try {
        const cleaned = cleanPhoneNumber(targetPhone);
        if (!phoneNumberRegex.test(cleaned)) continue;

        const socketId = await getSocket(userType, cleaned);
        if (!socketId) continue;

        const res = await emitMessage({
          eventName: eventName || "messages",
          messageDetails: JSON.stringify(message),
          socketId,
        });

        if (res.status === "success" || res.message === "success") {
          results.push({ status: "success", phoneNumber: cleaned });
        }
      } catch (err) {
        logger.error("Error sending to company member", {
          phoneNumber: targetPhone,
          error: err.message,
        });
      }
    }

    return { status: "success", data: results };
  } catch (error) {
    logger.error("Error sending notification to company members", {
      companyUniqueId,
      error: error.message,
    });
    return { status: "error", message: error.message };
  }
};

module.exports = {
  sendSocketIONotificationToAdmin,
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
  sendSocketIONotificationToCompany,
};
