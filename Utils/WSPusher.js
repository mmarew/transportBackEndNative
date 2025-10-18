// Utils/WSPusher.js
const { getData } = require("../CRUD/Read/ReadData");
const verifyToken = require("../Middleware/VerifyToken");
const verifyPassword = require("./VerifyPassword");
const { emitMessage } = require("./WsServerResponder");
const { setSocket } = require("./WsConnectionStore");
const {
  getPassengerJourneyStatus,
} = require("../Services/PassengerRequest.service");
const { getDriverJourneyStatus } = require("../Services/DriverRequest.service");
const { verifyPassengerStatus } = require("../Services/UsersCurrentStatus");
const messageTypes = require("./MessageTypes");

const phoneNumberRegex = /^[0-9]{9,15}$/;

// const tableNames = require("../Config/Tables.confg").default;

async function WSPusher({ io, socket }) {
  const socketId = socket?.id;
  try {
    const urlParams = new URLSearchParams(socket.handshake.query);
    console.log("🔌 Client connected:", socketId);

    const phoneNumber = urlParams.get("phoneNumber");
    const user = urlParams.get("user");
    const token = urlParams.get("token");

    if (!token) {
      return emitMessage({
        socketId,
        eventName: "messages",
        messageDetails: "Token is required for connection.",
      });
    }

    const tokenValidation = await verifyToken.verifyTokenOfWS(token);
    if (!tokenValidation?.valid) {
      return emitMessage({
        socketId,
        eventName: "messages",
        messageDetails: "You are not authorized user",
      });
    }

    const userUniqueId = tokenValidation.data.userUniqueId;
    if (!userUniqueId) {
      return emitMessage({
        socketId,
        eventName: "messages",
        messageDetails: "Invalid token data.",
      });
    }
    const cleanedPhoneNumber = phoneNumber?.replace(/\D/g, "");

    if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
      return emitMessage({
        socketId,
        eventName: "messages",
        messageDetails: "Invalid phone number format (9–15 digits)",
      });
    }

    const validUserTypes = ["driver", "passenger", "SMSSender", "admin"];
    if (!validUserTypes.includes(user)) {
      return emitMessage({
        socketId,
        eventName: "messages",
        messageDetails: "Invalid user type",
      });
    }

    // Special check for SMSSender
    if (user === "SMSSender") {
      const password = urlParams.get("password");
      if (!password) {
        return emitMessage({
          socketId,
          eventName: "messages",
          messageDetails: "Password is required for SMS sender",
        });
      }

      const smsSenderData = await getData({
        tableName: "SMSSender",
        conditions: { phoneNumber: cleanedPhoneNumber },
      });

      if (!smsSenderData.length) {
        return emitMessage({
          socketId,
          eventName: "messages",
          messageDetails: "This phone number is not found",
        });
      }

      const hashedPassword = smsSenderData[0].password;
      const verification = await verifyPassword({
        hashedPassword,
        notHashedPassword: password,
      });

      if (verification.message !== "success") {
        return emitMessage({
          socketId,
          eventName: "messages",
          messageDetails: "You are not authorized sender",
        });
      }
    }

    // Set the socket mapping in Redis using a unique key for user type
    await setSocket(user, cleanedPhoneNumber, socketId);
    socket.userType = user;
    socket.identifier = cleanedPhoneNumber;
    // Get status if passenger or driver
    let status = null;
    if (user === "passenger") {
      status = await getPassengerJourneyStatus(userUniqueId);
    } else if (user === "driver") {
      status = await getDriverJourneyStatus(userUniqueId);
    }

    return emitMessage({
      socketId,
      eventName: "messages",
      messageDetails: JSON.stringify({
        messageTypes: messageTypes.connection_established,
        status,
        socketId,
        message: "success",
        data: `Socket connection established for user ${user}`,
      }),
    });
  } catch (error) {
    console.log("[WSPusher ERROR]:", error);
    return emitMessage({
      socketId,
      error: "Internal server error occurred during socket registration.",
      message: "error",
      eventName: "messages",
      messageDetails:
        "Internal server error occurred during socket registration.",
    });
  }
}

module.exports = WSPusher;
