let listOfDriverWs = [];
let listOfPassangerWs = [];
let listOfSMSSenderWs = [];
const listOfAdminWs = [];
let socketIO = {};

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
  const socketData = socketIO.io
    .to(socketId)
    .emit(messageTitle, messageDetailes);

  if (socketData == true)
    return { message: "success", data: "message sent successfully" };
  else return { message: "error", data: "message can't be sent successfully" };
};

module.exports = {
  // WSServerTextMessageResponder,
  sendOtpViaWebSocket,
  listOfDriverWs,
  listOfPassangerWs,
  listOfSMSSenderWs,
  listOfAdminWs,
  socketIO,
  emitMessage,
};
