const verifyToken = require("../Middleware/verifyToken");
const {
  listOfDriverWs,
  listOfPassangerWs,
  listOfSMSSenderWs,
} = require("./WsServerResponder");
const verifySMSSenderReality = require("./verifySMSSenderReality");

async function WSPusher(urlParams, WS) {
  const phoneNumber = urlParams.get("phoneNumber");
  const user = urlParams.get("user");
  WS.listType = user;
  if (user == "driver") {
    const token = urlParams.get("token");
    const mytoken = verifyToken(token);
    console.log("mytoken", mytoken);
    if (mytoken.valid) listOfDriverWs.push({ phoneNumber, WS });
    else return WS.send("you are not authorized");
  } else if (user == "passanger") {
    const token = urlParams.get("token");
    // console.log("user", user, " phoneNumber ", phoneNumber);
    listOfPassangerWs.push({ phoneNumber, WS });
    console.log("listOfPassangerWs", listOfPassangerWs);
    const mytoken = verifyToken(token);
    if (mytoken.valid) {
      listOfPassangerWs.push({ phoneNumber, WS });
      WS.send("socket connection created successfully");
    } else return WS.send("you are not authorized");
  } else if (user == "SMSSender") {
    const password = urlParams.get("password");
    if (phoneNumber == null) return;
    if (password == null) return;
    let veification = await verifySMSSenderReality(phoneNumber, password);
    console.log("veification", veification);
    let { message } = veification;
    if (message == "success") {
      listOfSMSSenderWs.push({ phoneNumber, WS });
      WS.send("success");
    } else return WS.send("you are not authorized");
  }
}

module.exports = WSPusher;
