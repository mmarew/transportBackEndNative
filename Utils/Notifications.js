const { emitMessage } = require("./WsServerResponder");
const { getSocket, getAllSockets } = require("./WsConnectionStore");
const { redis } = require("../Config/redis.config");

// Regular expression to validate phone numbers (only digits, between 9 and 15 digits)
const phoneNumberRegex = /^[0-9]{9,15}$/;

// Clean phone number by removing non-digit characters
const cleanPhoneNumber = (phoneNumber) => {
  return phoneNumber?.replace(/\D/g, "");
};

// 🔔 Notify a specific driver by phone number
const sendNotificationToDriver = async ({ message, phoneNumber }) => {
  try {
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      return { message: "error", data: "Invalid phone number format" };
    }

    const socketId = await getSocket("driver", cleanedPhoneNumber);
    console.log("@sendNotificationToDriver socketId", socketId);
    getAllSockets();
    if (!socketId) {
      console.log(
        "@sendNotificationToDriver socketId not found " +
          socketId +
          " cleanedPhoneNumber " +
          cleanedPhoneNumber
      );
      return {
        message: "error",
        data: "No active driver socket found for this phone number",
      };
    }

    const res = await emitMessage({
      messageTitle: "messages",
      messageDetails: JSON.stringify(message),
      socketId,
    });

    if (res.message === "success") {
      return { message: "success", data: "Message sent to driver" };
    } else {
      return { message: "error", data: "Failed to send message to driver" };
    }
  } catch (error) {
    console.error("Error in sendNotificationToDriver:", error);
    return { message: "error", data: "Request can't be sent to driver" };
  }
};

// Backward-compatible alias using Socket.IO naming (must be declared after function)
const sendSocketIONotificationToDriver = sendNotificationToDriver;

// 🔔 Notify a specific passenger by phone number
const sendNotificationToPassenger = async ({ message, phoneNumber }) => {
  try {
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      return { message: "error", data: "Invalid phone number format" };
    }

    const socketId = await getSocket("passenger", cleanedPhoneNumber);
    if (!socketId) {
      return {
        message: "error",
        data: "No active passenger socket found for this phone number",
      };
    }

    const res = await emitMessage({
      messageTitle: "messages",
      messageDetails: JSON.stringify(message),
      socketId,
    });

    if (res.message === "success") {
      return { message: "success", data: "Message sent to passenger" };
    } else {
      return {
        message: "error",
        data: "Failed to send message to passenger",
      };
    }
  } catch (error) {
    console.error("Error in sendNotificationToPassenger:", error);
    return { message: "error", data: "Message can't be sent to passenger" };
  }
};

const sendNotificationToAdmin = async ({ message }) => {
  try {
    const keys = await redis.keys("admin:*");

    const successList = [];
    const errorList = [];

    for (const key of keys) {
      const socketId = await redis.get(key);
      if (!socketId) continue;

      try {
        const res = await emitMessage({
          messageTitle: "messages",
          messageDetails: JSON.stringify(message),
          socketId,
        });

        if (res.message === "success") {
          successList.push({
            socketId,
            message: "success",
            detail: "Message sent to admin",
          });
        } else {
          errorList.push({
            socketId,
            message: "error",
            detail: "Failed to send message to admin",
          });
        }
      } catch (err) {
        console.error(`Error sending to admin socketId ${socketId}:`, err);
        errorList.push({
          socketId,
          message: "error",
          detail: "Exception while sending to admin",
        });
      }
    }

    await redis.quit(); // Clean disconnect for ioredis

    return {
      message: successList.length > 0 ? "success" : "error",
      data:
        successList.length > 0
          ? "Messages sent successfully to admins"
          : "No admin message was sent",
      success: successList,
      error: errorList,
    };
  } catch (error) {
    console.error("Error in sendNotificationToAdmin:", error);
    return { message: "error", error: "Message can't be sent to admin" };
  }
};

module.exports = {
  sendNotificationToAdmin,
  sendSocketIONotificationToDriver,
  sendNotificationToPassenger,
};
