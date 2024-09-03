let listOfDriverWs = [];
let listOfPassangerWs = [];
let listOfSMSSenderWs = [];

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

const WSServerTextMessageResponder = async (ws, message) => {
  console.log("message", message);
  ws.send(JSON.stringify({ message }));
};
module.exports = {
  WSServerTextMessageResponder,
  sendOtpViaWebSocket,
  listOfDriverWs,
  listOfPassangerWs,
  listOfSMSSenderWs,
};
