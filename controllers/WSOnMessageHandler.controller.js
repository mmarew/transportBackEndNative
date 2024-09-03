const WSOnMessageService = require("../services/WSOnMessageHandler.service");
const { WSServerTextMessageResponder } = require("../Utils/WsServerResponder");
const handleOnMessage = async (ws, data) => {
  console.log("@ handleOnMessage", typeof data);
  return;
  const { messageType, message } = JSON.parse(data);
  console.log("messageType", messageType);
  if (messageType === "usersRequest") {
    const result = await WSOnMessageService.registerPassangerRequest(message);
    WSServerTextMessageResponder(ws, result);
  }
  if (messageType === "registerDriverToGetPassengerRequest") {
    const result = await WSOnMessageService.registerDriverWaiting(message);
    WSServerTextMessageResponder(ws, result);
  }
};
module.exports = handleOnMessage;
