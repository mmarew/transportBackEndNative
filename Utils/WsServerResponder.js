const listOfSMSSenderWs = [];

const socketIO = {};

const sendOtpViaWebSocket = async (phoneNumber, OTP) => {
  try {
    console.log("@sendOtpViaWebSocket listOfSMSSenderWs", listOfSMSSenderWs);
    listOfSMSSenderWs.map((ws) => {
      const socketId = ws.socketId;
      const res = emitMessage({
        socketId,
        messageDetailes: JSON.stringify({ OTP, phoneNumber }),
        messageTitle: "messages",
      });
      console.log("@sendOtpViaWebSocket res", res);
    });
    return { message: "success", data: "OTP sent successfully" };
  } catch (error) {
    return { message: "error", error: "Error in sending OTP" };
  }
};
const emitMessage = ({ socketId, messageTitle, messageDetailes }) => {
  const io = socketIO.io;
  if (!io) {
    console.log("@emitMessage Empity io");

    return { message: "error", data: "message can't be sent successfully" };
  }
  if (!socketId) {
    console.log("@emitMessage Empity socketId");

    return { message: "error", data: "message can't be sent successfully" };
  }
  const socketData = io.to(socketId).emit(messageTitle, messageDetailes);
  console.log("@emitMessage socketData", socketData);
  if (socketData == true) {
    return { message: "success", data: "message sent successfully" };
  } else {
    return { message: "error", data: "message can't be sent successfully" };
  }
};

module.exports = {
  sendOtpViaWebSocket,
  socketIO,
  emitMessage,
};
