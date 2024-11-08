const { getData } = require("../CRUD/Read/ReadData");
const verifyToken = require("../Middleware/verifyToken");
const verifyPassword = require("./VerifyPassword");
const {
  listOfDriverWs,
  listOfPassangerWs,
  listOfSMSSenderWs,
  listOfAdminWs,
} = require("./WsServerResponder");

// Regex for validating phone number (no + sign, no spaces, only digits)
const phoneNumberRegex = /^[0-9]{9,15}$/; // Only digits, length between 9 and 15 digits

async function WSPusher(urlParams, WS) {
  try {
    const phoneNumber = urlParams.get("phoneNumber");
    const user = urlParams.get("user");
    const token = urlParams.get("token");
    // Token validation
    if (!token) {
      return WS.send("Token is required for connection");
    }
    const tokenValidation = await verifyToken.verifyTokenOfWS(token);
    console.log("tokenValidation", tokenValidation);
    if (!tokenValidation?.valid) {
      return WS.send("You are not authorized");
    }
    // Clean phone number (remove spaces and non-digit characters)
    const cleanedPhoneNumber = phoneNumber?.replace(/\D/g, "");

    // Phone number validation
    if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
      return WS.send(
        "Invalid phone number: should contain only digits, no spaces or + sign"
      );
    }

    // User validation
    if (!["driver", "passenger", "SMSSender", "admin"].includes(user)) {
      return WS.send("Invalid user type");
    }

    // Handle different user types
    WS.listType = user;
    switch (user) {
      case "admin":
        listOfAdminWs.push({ phoneNumber: cleanedPhoneNumber, WS });
        break;
      case "driver":
        listOfDriverWs.push({ phoneNumber: cleanedPhoneNumber, WS });
        break;
      case "passenger":
        listOfPassangerWs.push({ phoneNumber: cleanedPhoneNumber, WS });
        break;
      case "SMSSender":
        const password = urlParams.get("password");
        if (!password) {
          return WS.send("Password is required for SMS sender");
        }
        const smsSenderData = await getData({
          tableName: "SMSSender",
          conditions: { phoneNumber },
        });
        if (smsSenderData.length === 0) {
          return WS.send("This phone number is not found");
        }

        console.log("smsSenderData", smsSenderData);
        const hashedPassword = smsSenderData[0]?.password;

        const verification = await verifyPassword({
          hashedPassword,
          notHashedPassword: password,
        });
        console.log("verification of password ", verification);
        if (verification.message === "success") {
          listOfSMSSenderWs.push({ phoneNumber: cleanedPhoneNumber, WS });
          // WS.send("SMS Sender connected successfully");
        } else {
          WS.send("You are not authorized");
        }
        break;
      default:
        WS.send("Invalid user type");
        break;
    }
    const message = {
      message: "success",
      data: "Socket connection created successfully for user " + user,
    };
    WS.send(JSON.stringify(message));
  } catch (error) {
    console.error("Error in WSPusher:", error);
    WS.send("An error occurred during the connection process");
  }
}

module.exports = WSPusher;
