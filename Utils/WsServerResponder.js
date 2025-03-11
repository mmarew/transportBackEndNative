let listOfDriverWs = [];
let listOfPassangerWs = [];
let listOfSMSSenderWs = [];
const listOfAdminWs = [];
let socketIO = {};

const sendOtpViaWebSocket = async (phoneNumber, OTP) => {
  try {
    listOfSMSSenderWs.map((ws) =>
      ws.WS.send(JSON.stringify({ OTP, phoneNumber }))
    );
    return { message: "success", data: "OTP sent successfully" };
  } catch (error) {
    return { message: "error", error: "Error in sending OTP" };
  }
};
const emitMessage = ({ socketId, messageTitle, messageDetailes }) => {
  const socketData = socketIO.io
    .to(socketId)
    .emit(messageTitle, messageDetailes);
  console.log(
    "@socketData emitMessage",
    socketData,
    "socketId",
    socketId,
    "messageTitle",
    messageTitle
  );
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
