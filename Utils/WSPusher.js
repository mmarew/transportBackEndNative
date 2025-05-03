// const { getData } = require("../CRUD/Read/ReadData");
// const verifyToken = require("../Middleware/VerifyToken");
// const {
//   getPassengerJourneyStatus,
// } = require("../Services/PassengerRequest.service");
// const { getDriverJourneyStatus } = require("../Services/DriverRequest.service");
// const verifyPassword = require("./VerifyPassword");
// const {
//   listOfDriverWs,
//   listOfPassangerWs,
//   listOfSMSSenderWs,
//   listOfAdminWs,
//   emitMessage,
// } = require("./WsServerResponder");

// const { default: tableNames } = require("../Config/Tables.confg");

// // Regex for validating phone number (no + sign, no spaces, only digits)
// const phoneNumberRegex = /^[0-9]{9,15}$/; // Only digits, length between 9 and 15 digits
// // it push data to  listOfDriverWs, listOfPassangerWs, listOfSMSSenderWs, listOfAdminWs,

// async function WSPusher(urlParams, socketId) {
//   try {
//     console.log(
//       "@WSPusher urlParams =======> ",
//       urlParams,
//       "\nsocketId",
//       socketId
//     );
//     const phoneNumber = urlParams.get("phoneNumber");
//     const user = urlParams.get("user");
//     const token = urlParams.get("token");

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
//     const cleanedPhoneNumber = phoneNumber?.replace(/\D/g, "");

//     if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
//       return emitMessage({
//         socketId,
//         messageTitle: "messages",
//         messageDetailes:
//           "Invalid phone number: should contain only digits (9-15 digits)",
//       });
//     }

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

//     const userLists = {
//       admin: listOfAdminWs,
//       driver: listOfDriverWs,
//       passenger: listOfPassangerWs,
//       SMSSender: listOfSMSSenderWs,
//     };

//     // SMS sender special validation
//     if (user === "SMSSender") {
//       const password = urlParams.get("password");
//       if (!password) {
//         return emitMessage({
//           socketId,
//           messageTitle: "messages",
//           messageDetailes: "Password is required for SMS sender",
//         });
//       }
//       console.log("@SMSSENDER", tableNames);
//       const smsSenderData = await getData({
//         tableName: "SMSSender",
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
//     }

//     // Validate and replace existing entry based on phoneNumber
//     const targetList = userLists[user];
//     const existingIndex = targetList.findIndex(
//       (entry) => entry.phoneNumber === cleanedPhoneNumber
//     );

//     if (existingIndex !== -1) {
//       targetList[existingIndex] = listOfData; // Replace existing
//     } else {
//       targetList.push(listOfData); // Add new
//     }

//     let status = null;
//     if (user === "passenger") {
//       status = await getPassengerJourneyStatus(userUniquId);
//     } else if (user === "driver") {
//       status = await getDriverJourneyStatus(userUniquId);
//     }

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

// Utils/WSPusher.js
const { getData } = require("../CRUD/Read/ReadData");
const verifyToken = require("../Middleware/VerifyToken");
const verifyPassword = require("./VerifyPassword");
const { emitMessage } = require("./WsServerResponder");
const { setSocket } = require("./WsConnectionStore");
const {
  getPassengerJourneyStatus,
} = require("../Services/PassengerRequest.service");
const { getDriverJourneyStatus } = require("../Services/DriverRequest.service");

const phoneNumberRegex = /^[0-9]{9,15}$/;

// const tableNames = require("../Config/Tables.confg").default;

async function WSPusher(urlParams, socketId) {
  try {
    console.log(
      "@WSPusher urlParams =======> ",
      urlParams,
      "\nsocketId",
      socketId
    );

    const phoneNumber = urlParams.get("phoneNumber");
    const user = urlParams.get("user");
    const token = urlParams.get("token");

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

    const userUniqueId = tokenValidation.data.userUniqueId;
    const cleanedPhoneNumber = phoneNumber?.replace(/\D/g, "");

    if (!cleanedPhoneNumber || !phoneNumberRegex.test(cleanedPhoneNumber)) {
      return emitMessage({
        socketId,
        messageTitle: "messages",
        messageDetailes: "Invalid phone number format (9–15 digits)",
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

    // Special check for SMSSender
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
        tableName: "SMSSender",
        conditions: { phoneNumber: cleanedPhoneNumber },
      });

      if (!smsSenderData.length) {
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

    // Set the socket mapping in Redis using a unique key for user type
    await setSocket(user, cleanedPhoneNumber, socketId);

    // Get status if passenger or driver
    let status = null;
    if (user === "passenger") {
      status = await getPassengerJourneyStatus(userUniqueId);
    } else if (user === "driver") {
      status = await getDriverJourneyStatus(userUniqueId);
    }

    return emitMessage({
      socketId,
      messageTitle: "messages",
      messageDetailes: JSON.stringify({
        status,
        message: "success",
        data: `Socket connection established for user ${user}`,
      }),
    });
  } catch (error) {
    console.error("[WSPusher ERROR]:", error);
    return emitMessage({
      socketId,
      messageTitle: "messages",
      messageDetailes:
        "Internal server error occurred during socket registration.",
    });
  }
}

module.exports = WSPusher;
