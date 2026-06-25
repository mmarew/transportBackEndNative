const { emitMessage } = require("./WsServerResponder");
const { getSocket, getAllSockets } = require("./WsConnectionStore");
const { redis } = require("../Config/redis.config");
const logger = require("./logger");
const AppError = require("./AppError");
const { db } = require("../Services/CompanyHelper.service");

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
  userType = "driver",
}) => {
  try {
    logger.debug("@sendSocketIONotificationToDriver", {
      messageTypes: message.messageTypes,
      phoneNumber,
    });

    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      throw new AppError("Invalid phone number format", 400);
    }

    const socketId = await getSocket(userType, cleanedPhoneNumber);
    getAllSockets();
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
    logger.error("Error sending notification to driver", {
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
  userType = "shipper",
}) => {
  try {
    logger.debug("@sendSocketIONotificationToShipper", {
      phoneNumber,
      eventName: eventName || "messages",
    });
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);
    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      throw new AppError("Invalid phone number format", 400);
    }

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
    logger.error("Error sending notification to shipper", {
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
      keys = await redis.keys("admin:*");
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

// 🔔 Notify all members of a company via WebSocket
const sendSocketIONotificationToCompany = async ({
  companyUniqueId,
  message,
  eventName,
  userType = "company", // Company admins/dispatchers connect with user=company
}) => {
  try {
    const [members] = await db().query(
      `SELECT u.phoneNumber 
       FROM CompanyMembership cm
       JOIN Users u ON cm.userUniqueId = u.userUniqueId
       WHERE cm.companyUniqueId = ? 
         AND cm.isActive = 1 
         AND cm.membershipDeletedAt IS NULL`,
      [companyUniqueId],
    );

    if (!members || members.length === 0) {
      logger.debug("No members found for company to notify via socket", {
        companyUniqueId,
      });
      return { status: "success", data: "No members to notify" };
    }

    const results = await Promise.all(
      members.map((member) =>
        sendSocketIONotificationToDriver({
          message,
          phoneNumber: member.phoneNumber,
          eventName,
          userType,
        }),
      ),
    );

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
