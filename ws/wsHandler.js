const { removeWSFromList } = require("../Utils/RemoveWsFromList");
const WSPusher = require("../Utils/WSPusher");

const handleMessage = (ws, incomingMessage) => {
  const textMessage = incomingMessage.toString();
  if (textMessage) {
    ws.send("Received text message from client");
  }
};

const handleClose = (ws) => {
  removeWSFromList(ws);
};

const handleConnection = (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split("?")[1]);
  WSPusher(urlParams, ws);
  ws.on("message", (message) => handleMessage(ws, message));
  ws.on("close", () => handleClose(ws));
};

module.exports = {
  handleConnection,
};
