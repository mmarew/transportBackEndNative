const {
  listOfSMSSenderWs,
  listOfDriverWs,
  listOfPassangerWs,
} = require("./WsServerResponder");

function removeWSFromList(ws) {
  try {
    if (ws.listType === "driver") {
      const index = listOfDriverWs.findIndex((item) => item.WS === ws);
      if (index !== -1) listOfDriverWs.splice(index, 1);
    } else if (ws.listType === "passanger") {
      const index = listOfPassangerWs.findIndex((item) => item.WS === ws);
      if (index !== -1) listOfPassangerWs.splice(index, 1);
    } else if (ws.listType === "SMSSender") {
      const index = listOfSMSSenderWs.findIndex((item) => item.WS === ws);
      if (index !== -1) listOfSMSSenderWs.splice(index, 1);
    }
  } catch (error) {
    console.log("error", error);
  }
}

module.exports = { removeWSFromList };
