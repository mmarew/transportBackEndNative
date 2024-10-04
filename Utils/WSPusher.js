const verifyToken = require("../Middleware/verifyToken");
const {
  listOfDriverWs,
  listOfPassangerWs,
  listOfSMSSenderWs,
} = require("./WsServerResponder");
const verifySMSSenderReality = require("./verifySMSSenderReality");

// Regex for validating phone number (no + sign, no spaces, only digits)
const phoneNumberRegex = /^[0-9]{9,15}$/; // Validates only digits, length between 9 and 15 digits

async function WSPusher(urlParams, WS) {
  const phoneNumber = urlParams.get("phoneNumber");
  const user = urlParams.get("user");

  // Clean phone number (remove spaces and non-digit characters)
  const cleanedPhoneNumber = phoneNumber.replace(/\D/g, "");

  // Validate phone number
  if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
    return WS.send(
      "Invalid phone number: should contain only digits, no spaces or + sign"
    );
  }

  // Validate user
  if (!user || !["driver", "passenger", "SMSSender"].includes(user)) {
    return WS.send("Invalid user type");
  }

  WS.listType = user;

  if (user === "driver") {
    const token = urlParams.get("token");
    if (!token) {
      return WS.send("Token is required for driver");
    }

    const mytoken = await verifyToken.verifyTokenOfWS(token);
    console.log("mytoken", mytoken);

    if (mytoken.valid) {
      listOfDriverWs.push({ phoneNumber: cleanedPhoneNumber, WS });
      WS.send("Socket connection created successfully");
    } else {
      return WS.send("You are not authorized");
    }
  } else if (user === "passenger") {
    const token = urlParams.get("token");
    if (!token) {
      return WS.send("Token is required for passenger");
    }

    const mytoken = await verifyToken.verifyTokenOfWS(token);
    if (mytoken.valid) {
      listOfPassangerWs.push({ phoneNumber: cleanedPhoneNumber, WS });
      WS.send("Socket connection created successfully");
    } else {
      return WS.send("You are not authorized");
    }
  } else if (user === "SMSSender") {
    const password = urlParams.get("password");

    if (!cleanedPhoneNumber || !password) {
      return WS.send("Phone number and password are required for SMS sender");
    }

    let verification = await verifySMSSenderReality(
      cleanedPhoneNumber,
      password
    );
    console.log("verification", verification);

    let { message } = verification;
    if (message === "success") {
      listOfSMSSenderWs.push({ phoneNumber: cleanedPhoneNumber, WS });
      WS.send("Success");
    } else {
      return WS.send("You are not authorized");
    }
  }
}

module.exports = WSPusher;
