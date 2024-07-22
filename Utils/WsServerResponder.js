let listOfDriverWs = [];
let listOfPassangerWs = [];
let listOfSMSSenderWs = [];

const WsServerSMSResponder = async (phoneNumber, OTP) => {
  try {
    // console.log("listOfSMSSenderWs", listOfSMSSenderWs);
    listOfSMSSenderWs.map((ws) =>
      ws.WS.send(JSON.stringify({ OTP, phoneNumber }))
    );
    // listOfSMSSenderWs[0]?.WS?.send(JSON.stringify({ OTP, phoneNumber }));
    return { message: "success", data: "OTP sent successfully" };
  } catch (error) {
    return { message: "error", error: "Error in sending OTP" };
  }
};
const WSServerTextMessageResponder = async (ws, message) => {
  ws.send(JSON.stringify({ message }));
};
module.exports = {
  WSServerTextMessageResponder,
  WsServerSMSResponder,
  listOfDriverWs,
  listOfPassangerWs,
  listOfSMSSenderWs,
};
