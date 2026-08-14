// Utils/WSPusher.js
const { getData } = require("../CRUD/Read/ReadData");
const verifyToken = require("../Middleware/VerifyToken");
const verifyPassword = require("./VerifyPassword");
const { emitMessage, sendError } = require("./WsServerResponder");
const { setSocket } = require("./WsConnectionStore");
const { getShipperJourneyStatus } = require("../Services/ShipperRequest");
const { getDriverJourneyStatus } = require("../Services/DriverRequest");
const messageTypes = require("./MessageTypes");
const logger = require("./logger");
const { getLastLocationsForShipper } = require("./LastLocationStore");

const phoneNumberRegex = /^[0-9]{9,15}$/;

// const tableNames = require("../Config/Tables.confg").default;

async function WSPusher({ socket }) {
  const socketId = socket?.id;
  try {
    let { token, phoneNumber, user } = socket.handshake.auth || {};

    // Fallback to headers (Postman Socket.IO client sends custom headers
    // from the Headers tab into socket.handshake.headers)
    // Note: Node.js lowercases all header names
    if (!token || !phoneNumber || !user) {
      const headers = socket.handshake.headers || {};
      token = token || headers.token || headers.authorization;
      phoneNumber = phoneNumber || headers.phoneNumber || headers.phonenumber;
      user = user || headers.user;
    }

    if (!token) {
      return sendError(
        socket,
        "Token is required for connection.",
        "UNAUTHORIZED",
      );
    }

    const tokenValidation = await verifyToken.verifyTokenOfWS(token);
    if (!tokenValidation?.valid) {
      return sendError(socket, "You are not authorized user", "UNAUTHORIZED");
    }

    const userUniqueId = tokenValidation.data.userUniqueId;
    if (!userUniqueId) {
      return sendError(socket, "Invalid token data.", "BAD_REQUEST");
    }
    const cleanedPhoneNumber = phoneNumber?.replace(/\D/g, "");

    if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
      return sendError(
        socket,
        "Invalid phone number format (9–15 digits)",
        "BAD_REQUEST",
      );
    }

    const validUserTypes = [
      "driver",
      "shipper",
      "SMSSender",
      "admin",
      "company",
      "queueOrgAdmin",
    ];
    if (!validUserTypes.includes(user)) {
      return sendError(socket, "Invalid user type", "BAD_REQUEST");
    }

    // Special check for SMSSender
    if (user === "SMSSender") {
      const password = socket.handshake.auth.password;
      if (!password) {
        return sendError(
          socket,
          "Password is required for SMS sender",
          "BAD_REQUEST",
        );
      }

      const smsSenderData = await getData({
        tableName: "SMSSender",
        conditions: { phoneNumber: cleanedPhoneNumber },
      });

      if (!smsSenderData.length) {
        return sendError(socket, "This phone number is not found", "NOT_FOUND");
      }

      const hashedPassword = smsSenderData[0].password;
      const verification = await verifyPassword({
        hashedPassword,
        notHashedPassword: password,
      });

      if (verification.message !== "success") {
        return sendError(
          socket,
          "You are not authorized sender",
          "UNAUTHORIZED",
        );
      }
    }

    // Set the socket mapping in Redis using a unique key for user type
    await setSocket(user, cleanedPhoneNumber, socketId);
    socket.userType = user;
    socket.identifier = cleanedPhoneNumber;

    // Replay the driver's last known position(s) to a shipper that just
    // connected/reconnected so the map shows the truck immediately (no waiting
    // for the next tracker tick or the 30s REST poll). Emits right here, in the
    // same connection flow as connection_established, so the client listener is
    // already attached.
    if (user === "shipper") {
      try {
        const lastLocations = await getLastLocationsForShipper(
          cleanedPhoneNumber,
        );
        if (lastLocations.length) {
          for (const loc of lastLocations) {
            socket.emit("locationUpdateToShipper", { ...loc, replayed: true });
          }
          logger.debug("Replayed last known locations to shipper", {
            phoneNumber: cleanedPhoneNumber,
            count: lastLocations.length,
          });
        }
      } catch (replayError) {
        logger.warn("Replay last locations failed", {
          error: replayError.message,
        });
      }
    }

    // Get status if shipper or driver
    let status = null;
    if (user === "shipper") {
      status = await getShipperJourneyStatus(userUniqueId);
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
    const logger = require("../Utils/logger");
    logger.error("WSPusher error", {
      socketId,
      error: error.message,
      stack: error.stack,
      handshake: socket?.handshake?.auth,
    });

    return sendError(
      socket,
      "Internal server error occurred during socket registration.",
      "INTERNAL_SERVER_ERROR",
    );
  }
}

module.exports = WSPusher;
