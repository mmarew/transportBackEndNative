// // Notifications.js
// const {
//   listOfDriverWs,
//   listOfPassangerWs,
//   listOfAdminWs,
//   emitMessage,
// } = require("./WsServerResponder");

// // Regular expression to validate phone numbers (only digits, between 9 and 15 digits)
// const phoneNumberRegex = /^[0-9]{9,15}$/;

// // Function to clean phone numbers (remove spaces and + sign)
// const cleanPhoneNumber = (phoneNumber) => {
//   return phoneNumber?.replace(/\D/g, "");
// };

// // Send notification to the driver based on the phone number
// const sendNotificationToDriver = async ({ message, phoneNumber }) => {
//   try {
//     // Clean the phone number before processing
//     const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

//     // Validate the cleaned phone number using regex
//     if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
//       return { message: "error", data: "Invalid phone number format" };
//     }

//     // Send notification to the matching driver using a for...of loop
//     for (const driver of listOfDriverWs) {
//       if (driver?.phoneNumber === cleanedPhoneNumber) {
//         try {
//           const socketId = driver?.socketId;
//           console.log("@sendNotificationToDriver driver =========> ", driver);
//           const res = await emitMessage({
//             messageTitle: "messages",
//             messageDetailes: JSON.stringify(message),
//             socketId,
//           });
//           console.log("@sendNotificationToDriver res", res);

//           if (res.message === "error") {
//             return {
//               message: "error",
//               data: "Failed to send message to driver",
//             };
//           } else if (res.message === "success") {
//             return {
//               message: "success",
//               data: "Message to driver sent successfully",
//             };
//           }
//         } catch (error) {
//           console.log("Error sending message to driver:", error);
//           return { message: "error", data: "Failed to send message to driver" };
//         }
//       }
//     }

//     return { message: "success", data: "Request sent to driver" };
//   } catch (error) {
//     console.log("error in sendNotificationToDriver", error);
//     return { message: "error", data: "Request can't be sent to driver" };
//   }
// };

// // Send notification to the passenger based on the phone number
// const sendNotificationToPassenger = async ({ message, phoneNumber }) => {
//   try {
//     console.log("@send notification to passenger phoneNumber", phoneNumber);
//     if (!phoneNumber) {
//       console.log("phoneNumber required to ws connection");
//       return { message: "error", data: "Phone number is required" };
//     }

//     // Clean the phone number before processing
//     const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

//     // Validate the cleaned phone number using regex
//     if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
//       return { message: "error", data: "Invalid phone number format" };
//     }

//     console.log("listOfPassangerWs", listOfPassangerWs);

//     // Send notification to the matching passenger using a for...of loop
//     if (listOfPassangerWs && listOfPassangerWs.length > 0) {
//       for (const passenger of listOfPassangerWs) {
//         console.log("passenger", passenger);
//         if (passenger?.phoneNumber === cleanedPhoneNumber) {
//           console.log("@after evaluation");

//           try {
//             console.log("in try catch");
//             const socketId = passenger?.socketId;
//             const res = await emitMessage({
//               messageDetailes: JSON.stringify(message),
//               messageTitle: "messages",
//               socketId,
//             });

//             if (res.message === "error") {
//               return {
//                 message: "error",
//                 data: "Failed to send message to passenger",
//               };
//             } else if (res.message === "success") {
//               return {
//                 message: "success",
//                 data: "Message sent to passenger successfully",
//               };
//             }
//           } catch (error) {
//             console.log("Error sending message to passenger:", error);
//             return {
//               message: "error",
//               data: "Failed to send message to passenger",
//             };
//           }
//         }
//       }
//     } else {
//       console.log("listOfPassangerWs is null or empty");
//       return { message: "error", data: "No passengers available" };
//     }

//     return {
//       message: "success",
//       data: "Message to passenger sent successfully",
//     };
//   } catch (error) {
//     console.log("error in sendNotificationToPassenger", error);
//     return { message: "error", data: "Message can't be sent to passenger" };
//   }
// };

// // send notification to admin
// const sendNotificationToAdmin = async ({ message }) => {
//   try {
//     const errorList = [];
//     const successList = [];

//     if (listOfAdminWs && listOfAdminWs.length > 0) {
//       for (const admin of listOfAdminWs) {
//         if (admin) {
//           try {
//             const socketId = admin?.socketId;
//             const res = emitMessage({
//               messageDetailes: JSON.stringify(message),
//               messageTitle: "messages",
//               socketId,
//             });

//             if (res.message === "error") {
//               errorList.push({
//                 message: "error",
//                 data: "Message can't be sent to admin",
//                 errorOnData: message,
//               });
//             } else if (res.message === "success") {
//               successList.push({
//                 message: "success",
//                 data: "Message to admin sent successfully",
//                 successOnData: message,
//               });
//             }
//           } catch (error) {
//             console.log("Error sending message to admin:", error);
//             errorList.push({
//               message: "error",
//               data: "An error occurred while sending a message to admin",
//               errorOnData: message,
//             });
//           }
//         }
//       }
//     }

//     return {
//       message: successList.length > 0 ? "success" : "error",
//       data:
//         successList.length > 0
//           ? "Message sent successfully"
//           : "Message can't be sent to admin",
//       error: errorList,
//       success: successList,
//     };
//   } catch (error) {
//     console.log("Error in sendNotificationToAdmin:", error);
//     return { message: "error", error: "Message can't be sent to admin" };
//   }
// };
// module.exports = {
//   sendNotificationToAdmin,
//   sendNotificationToDriver,
//   sendNotificationToPassenger,
// };
// Notifications.js

const { emitMessage } = require("./WsServerResponder");
const { getSocket } = require("./WsConnectionStore");
const { redis } = require("../Config/redis.config");

// Regular expression to validate phone numbers (only digits, between 9 and 15 digits)
const phoneNumberRegex = /^[0-9]{9,15}$/;

// Clean phone number by removing non-digit characters
const cleanPhoneNumber = (phoneNumber) => {
  return phoneNumber?.replace(/\D/g, "");
};

// 🔔 Notify a specific driver by phone number
const sendNotificationToDriver = async ({ message, phoneNumber }) => {
  try {
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      return { message: "error", data: "Invalid phone number format" };
    }

    const socketId = await getSocket("driver", cleanedPhoneNumber);
    console.log("@sendNotificationToDriver socketId", socketId);
    if (!socketId) {
      return {
        message: "error",
        data: "No active driver socket found for this phone number",
      };
    }

    const res = await emitMessage({
      messageTitle: "messages",
      messageDetailes: JSON.stringify(message),
      socketId,
    });

    if (res.message === "success") {
      return { message: "success", data: "Message sent to driver" };
    } else {
      return { message: "error", data: "Failed to send message to driver" };
    }
  } catch (error) {
    console.error("Error in sendNotificationToDriver:", error);
    return { message: "error", data: "Request can't be sent to driver" };
  }
};

// 🔔 Notify a specific passenger by phone number
const sendNotificationToPassenger = async ({ message, phoneNumber }) => {
  try {
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      return { message: "error", data: "Invalid phone number format" };
    }

    const socketId = await getSocket("passenger", cleanedPhoneNumber);
    if (!socketId) {
      return {
        message: "error",
        data: "No active passenger socket found for this phone number",
      };
    }

    const res = await emitMessage({
      messageTitle: "messages",
      messageDetailes: JSON.stringify(message),
      socketId,
    });

    if (res.message === "success") {
      return { message: "success", data: "Message sent to passenger" };
    } else {
      return {
        message: "error",
        data: "Failed to send message to passenger",
      };
    }
  } catch (error) {
    console.error("Error in sendNotificationToPassenger:", error);
    return { message: "error", data: "Message can't be sent to passenger" };
  }
};

// 🔔 Notify all connected admins (broadcast to all admin sockets)
// const sendNotificationToAdmin = async ({ message }) => {
//   try {
//     const redis = require("redis").createClient({
//       socket: {
//         host: process.env.REDIS_HOST || "127.0.0.1",
//         port: process.env.REDIS_PORT || 6379,
//       },
//     });
//     await redis.connect();

//     const keys = await redis.keys("admin:*");

//     const successList = [];
//     const errorList = [];

//     for (const key of keys) {
//       const socketId = await redis.get(key);
//       if (!socketId) continue;

//       try {
//         const res = await emitMessage({
//           messageTitle: "messages",
//           messageDetailes: JSON.stringify(message),
//           socketId,
//         });

//         if (res.message === "success") {
//           successList.push({
//             socketId,
//             message: "success",
//             detail: "Message sent to admin",
//           });
//         } else {
//           errorList.push({
//             socketId,
//             message: "error",
//             detail: "Failed to send message to admin",
//           });
//         }
//       } catch (err) {
//         console.error(`Error sending to admin socketId ${socketId}:`, err);
//         errorList.push({
//           socketId,
//           message: "error",
//           detail: "Exception while sending to admin",
//         });
//       }
//     }

//     await redis.disconnect();

//     return {
//       message: successList.length > 0 ? "success" : "error",
//       data:
//         successList.length > 0
//           ? "Messages sent successfully to admins"
//           : "No admin message was sent",
//       success: successList,
//       error: errorList,
//     };
//   } catch (error) {
//     console.error("Error in sendNotificationToAdmin:", error);
//     return { message: "error", error: "Message can't be sent to admin" };
//   }
// };

const sendNotificationToAdmin = async ({ message }) => {
  try {
    const keys = await redis.keys("admin:*");

    const successList = [];
    const errorList = [];

    for (const key of keys) {
      const socketId = await redis.get(key);
      if (!socketId) continue;

      try {
        const res = await emitMessage({
          messageTitle: "messages",
          messageDetailes: JSON.stringify(message),
          socketId,
        });

        if (res.message === "success") {
          successList.push({
            socketId,
            message: "success",
            detail: "Message sent to admin",
          });
        } else {
          errorList.push({
            socketId,
            message: "error",
            detail: "Failed to send message to admin",
          });
        }
      } catch (err) {
        console.error(`Error sending to admin socketId ${socketId}:`, err);
        errorList.push({
          socketId,
          message: "error",
          detail: "Exception while sending to admin",
        });
      }
    }

    await redis.quit(); // Clean disconnect for ioredis

    return {
      message: successList.length > 0 ? "success" : "error",
      data:
        successList.length > 0
          ? "Messages sent successfully to admins"
          : "No admin message was sent",
      success: successList,
      error: errorList,
    };
  } catch (error) {
    console.error("Error in sendNotificationToAdmin:", error);
    return { message: "error", error: "Message can't be sent to admin" };
  }
};

module.exports = {
  sendNotificationToAdmin,
  sendNotificationToDriver,
  sendNotificationToPassenger,
};
