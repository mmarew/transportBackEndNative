const listOfSMSSenderWs = [];
const logger = require("./logger");

const socketIO = {};

const sendOtpViaWebSocket = async (phoneNumber, OTP) => {
  try {
    listOfSMSSenderWs.map((ws) => {
      const socketId = ws.socketId;
      emitMessage({
        socketId,
        eventName: "messages",
        messageDetails: JSON.stringify({ OTP, phoneNumber }),
      });
    });
    return {
      status: "success",
      message: "success",
      data: "OTP sent successfully",
    };
  } catch (error) {
    const AppError = require("./AppError");
    logger.error("Error sending OTP via WebSocket", {
      phoneNumber,
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Error in sending OTP", 500);
  }
};
const emitMessage = ({ socketId, eventName, messageDetails }) => {
  const io = socketIO.io;
  if (!io) {
    const AppError = require("./AppError");
    throw new AppError("message can't be sent successfully", 500);
  }
  if (!socketId) {
    const AppError = require("./AppError");
    throw new AppError("message can't be sent successfully", 500);
  }
  const sock = io.sockets.sockets.get(socketId);
  console.log("EMIT", { socketId, eventName, exists: !!sock, total: io.sockets.sockets.size });
  io.to(socketId).emit(eventName, messageDetails);

  return {
    status: "success",
    message: "success",
    data: "message sent successfully",
  };
};

/**
 * Sends a standardized error message via socket
 * @param {Object} socket - The socket instance
 * @param {Error|String} error - The error object or message
 * @param {String} [code] - Optional error code
 * @param {String} [eventName] - Optional event name, defaults to 'messages'
 */
const sendError = (
  socket,
  error,
  code = "INTERNAL_SERVER_ERROR",
  eventName = "messages",
) => {
  if (!socket) {
    return;
  }

  const errorMessage =
    typeof error === "string" ? error : error.message || "Something went wrong";
  const errorCode = typeof error !== "string" && error.code ? error.code : code;

  socket.emit(eventName, {
    status: "error",
    message: "error",
    error: errorMessage,
    code: errorCode,
  });
};

module.exports = {
  sendOtpViaWebSocket,
  socketIO,
  emitMessage,
  sendError,
};
