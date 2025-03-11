const { getData } = require("../CRUD/Read/ReadData");
const verifyToken = require("../Middleware/VerifyToken");
const {
  getPassengerJourneyStatus,
} = require("../Services/PassengerRequest.service");
const { getDriverJourneyStatus } = require("../Services/DriverRequest.service");
const verifyPassword = require("./VerifyPassword");
const {
  listOfDriverWs,
  listOfPassangerWs,
  listOfSMSSenderWs,
  listOfAdminWs,
  emitMessage,
} = require("./WsServerResponder");

const { default: tableNames } = require("../Config/Tables.confg");

// Regex for validating phone number (no + sign, no spaces, only digits)
const phoneNumberRegex = /^[0-9]{9,15}$/; // Only digits, length between 9 and 15 digits
// it push data to  listOfDriverWs, listOfPassangerWs, listOfSMSSenderWs, listOfAdminWs,

// async function WSPusher(urlParams, socketId) {
//   try {
//     const phoneNumber = urlParams.get("phoneNumber");
//     const user = urlParams.get("user");
//     const token = urlParams.get("token");

//     console.log("[WSPusher] Incoming connection for user:", user);

//     // Token validation
//     if (!token) {
//       return emitMessage({
//         socketId,
//         messageTitle: "messages",
//         messageDetailes: "Token is required for connection.",
//       });
//     }

//     const tokenValidation = await verifyToken.verifyTokenOfWS(token);
//     if (!tokenValidation?.valid) {
//       return emitMessage({
//         socketId,
//         messageTitle: "messages",
//         messageDetailes: "You are not authorized",
//       });
//     }

//     const userUniquId = tokenValidation.data.userUniqueId;

//     // Clean and validate phone number
//     const cleanedPhoneNumber = phoneNumber?.replace(/\D/g, "");
//     if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
//       return emitMessage({
//         socketId,
//         messageTitle: "messages",
//         messageDetailes:
//           "Invalid phone number: should contain only digits (9-15 digits)",
//       });
//     }

//     // User validation
//     const validUserTypes = ["driver", "passenger", "SMSSender", "admin"];
//     if (!validUserTypes.includes(user)) {
//       return emitMessage({
//         socketId,
//         messageTitle: "messages",
//         messageDetailes: "Invalid user type",
//       });
//     }

//     const listOfData = {
//       phoneNumber: cleanedPhoneNumber,
//       socketId,
//       user,
//       token,
//     };

//     if (user === "SMSSender") {
//       const password = urlParams.get("password");
//       if (!password) {
//         return emitMessage({
//           socketId,
//           messageTitle: "messages",
//           messageDetailes: "Password is required for SMS sender",
//         });
//       }

//       const smsSenderData = await getData({
//         tableName: tableNames.SMSSENDER,
//         conditions: { phoneNumber: cleanedPhoneNumber },
//       });

//       if (smsSenderData.length === 0) {
//         return emitMessage({
//           socketId,
//           messageTitle: "messages",
//           messageDetailes: "This phone number is not found",
//         });
//       }

//       const hashedPassword = smsSenderData[0].password;
//       const verification = await verifyPassword({
//         hashedPassword,
//         notHashedPassword: password,
//       });

//       if (verification.message !== "success") {
//         return emitMessage({
//           socketId,
//           messageTitle: "messages",
//           messageDetailes: "You are not authorized",
//         });
//       }

//       listOfSMSSenderWs.push({ phoneNumber: cleanedPhoneNumber, socketId });
//     } else {
//       const userLists = {
//         admin: listOfAdminWs,
//         driver: listOfDriverWs,
//         passenger: listOfPassangerWs,
//       };
//       userLists[user].push(listOfData);
//     }

//     // Check journey status if needed
//     let status = null;
//     if (user === "passenger") {
//       status = await getPassengerJourneyStatus(userUniquId);
//     } else if (user === "driver") {
//       status = await getDriverJourneyStatus(userUniquId);
//     }

//     console.log("[WSPusher] Journey status:", user, status);

//     return emitMessage({
//       socketId,
//       messageTitle: "messages",
//       messageDetailes: JSON.stringify({
//         status,
//         message: "success",
//         data: `Socket connection created successfully for user ${user}`,
//       }),
//     });
//   } catch (error) {
//     console.error("[WSPusher ERROR]:", error);
//     return emitMessage({
//       socketId,
//       messageTitle: "messages",
//       messageDetailes: "An internal server error occurred.",
//     });
//   }
// }
// module.exports = WSPusher;
async function WSPusher(urlParams, socketId) {
  try {
    const phoneNumber = urlParams.get("phoneNumber");
    const user = urlParams.get("user");
    const token = urlParams.get("token");

    console.log("[WSPusher] Incoming connection for user:", user);

    if (!token) {
      return emitMessage({
        socketId,
        messageTitle: "messages",
        messageDetailes: "Token is required for connection.",
      });
    }

    const tokenValidation = await verifyToken.verifyTokenOfWS(token);
    if (!tokenValidation?.valid) {
      return emitMessage({
        socketId,
        messageTitle: "messages",
        messageDetailes: "You are not authorized",
      });
    }

    const userUniquId = tokenValidation.data.userUniqueId;
    const cleanedPhoneNumber = phoneNumber?.replace(/\D/g, "");

    if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
      return emitMessage({
        socketId,
        messageTitle: "messages",
        messageDetailes:
          "Invalid phone number: should contain only digits (9-15 digits)",
      });
    }

    const validUserTypes = ["driver", "passenger", "SMSSender", "admin"];
    if (!validUserTypes.includes(user)) {
      return emitMessage({
        socketId,
        messageTitle: "messages",
        messageDetailes: "Invalid user type",
      });
    }

    const listOfData = {
      phoneNumber: cleanedPhoneNumber,
      socketId,
      user,
      token,
    };

    const userLists = {
      admin: listOfAdminWs,
      driver: listOfDriverWs,
      passenger: listOfPassangerWs,
      SMSSender: listOfSMSSenderWs,
    };

    // SMS sender special validation
    if (user === "SMSSender") {
      const password = urlParams.get("password");
      if (!password) {
        return emitMessage({
          socketId,
          messageTitle: "messages",
          messageDetailes: "Password is required for SMS sender",
        });
      }

      const smsSenderData = await getData({
        tableName: tableNames.SMSSENDER,
        conditions: { phoneNumber: cleanedPhoneNumber },
      });

      if (smsSenderData.length === 0) {
        return emitMessage({
          socketId,
          messageTitle: "messages",
          messageDetailes: "This phone number is not found",
        });
      }

      const hashedPassword = smsSenderData[0].password;
      const verification = await verifyPassword({
        hashedPassword,
        notHashedPassword: password,
      });

      if (verification.message !== "success") {
        return emitMessage({
          socketId,
          messageTitle: "messages",
          messageDetailes: "You are not authorized",
        });
      }
    }

    // Validate and replace existing entry based on phoneNumber
    const targetList = userLists[user];
    const existingIndex = targetList.findIndex(
      (entry) => entry.phoneNumber === cleanedPhoneNumber
    );

    if (existingIndex !== -1) {
      targetList[existingIndex] = listOfData; // Replace existing
    } else {
      targetList.push(listOfData); // Add new
    }

    let status = null;
    if (user === "passenger") {
      status = await getPassengerJourneyStatus(userUniquId);
    } else if (user === "driver") {
      status = await getDriverJourneyStatus(userUniquId);
    }

    console.log("[WSPusher] Journey status:", user, status);

    return emitMessage({
      socketId,
      messageTitle: "messages",
      messageDetailes: JSON.stringify({
        status,
        message: "success",
        data: `Socket connection created successfully for user ${user}`,
      }),
    });
  } catch (error) {
    console.error("[WSPusher ERROR]:", error);
    return emitMessage({
      socketId,
      messageTitle: "messages",
      messageDetailes: "An internal server error occurred.",
    });
  }
}

module.exports = WSPusher;
