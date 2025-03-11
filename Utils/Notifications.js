const {
  listOfDriverWs,
  WSServerTextMessageResponder,
  listOfPassangerWs,
  listOfAdminWs,
  emitMessage,
} = require("./WsServerResponder");

// Regular expression to validate phone numbers (only digits, between 9 and 15 digits)
const phoneNumberRegex = /^[0-9]{9,15}$/;

// Function to clean phone numbers (remove spaces and + sign)
const cleanPhoneNumber = (phoneNumber) => {
  return phoneNumber?.replace(/\D/g, "");
};

// Send notification to the driver based on the phone number
const sendNotificationToDriver = async ({ message, phoneNumber }) => {
  try {
    // Clean the phone number before processing
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);
    console.log("cleanedPhoneNumber", cleanedPhoneNumber);

    // Validate the cleaned phone number using regex
    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      return { message: "error", data: "Invalid phone number format" };
    }

    // Send notification to the matching driver using a for...of loop
    for (const driver of listOfDriverWs) {
      console.log("@driver sendNotificationToDriver", driver);
      if (driver.phoneNumber === cleanedPhoneNumber) {
        try {
          const socketId = driver?.socketId;
          console.log("@sendNotificationToDriver driver =========> ", driver);
          const res = emitMessage({
            messageTitle: "messages",
            messageDetailes: JSON.stringify(message),
            socketId,
          });
          console.log("@sendNotificationToDriver res", res);
          // const res = await WSServerTextMessageResponder(driver.WS, message);
          if (res.message == "error") {
            return {
              message: "error",
              data: "Failed to send message to driver",
            };
          } else if (res.message == "success") {
            return {
              message: "success",
              data: "Message to driver sent successfully",
            };
          }
        } catch (error) {
          console.log("Error sending message to driver:", error);
          return { message: "error", data: "Failed to send message to driver" };
        }
      }
    }

    return { message: "success", data: "Request sent to driver" };
  } catch (error) {
    console.log("error in sendNotificationToDriver", error);
    return { message: "error", data: "Request can't be sent to driver" };
  }
};

// Send notification to the passenger based on the phone number
const sendNotificationToPassenger = async ({ message, phoneNumber }) => {
  try {
    console.log("@send notification to passenger phoneNumber", phoneNumber);
    if (!phoneNumber) {
      console.log("phoneNumber required to ws connection");
      return { message: "error", data: "Phone number is required" };
    }

    // Clean the phone number before processing
    const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

    // Validate the cleaned phone number using regex
    if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
      return { message: "error", data: "Invalid phone number format" };
    }
    console.log("listOfPassangerWs", listOfPassangerWs);
    // Send notification to the matching passenger using a for...of loop
    if (listOfPassangerWs && listOfPassangerWs.length > 0) {
      for (const passenger of listOfPassangerWs) {
        console.log("passenger", passenger);
        if (passenger?.phoneNumber === cleanedPhoneNumber) {
          console.log("@after evaluation");

          try {
            console.log("in try catch");
            // const res = await WSServerTextMessageResponder(
            //   passenger.WS,
            //   message
            // );
            const socketId = passenger?.socketId;
            const res = emitMessage({
              messageDetailes: JSON.stringify(message),
              messageTitle: "messages",
              socketId: socketId,
            });
            if (res.message === "error") {
              return {
                message: "error",
                data: "Failed to send message to passenger",
              };
            } else if (res.message === "success") {
              return {
                message: "success",
                data: "Message sent to passenger successfully",
              };
            }
          } catch (error) {
            console.log("Error sending message to passenger:", error);
            return {
              message: "error",
              data: "Failed to send message to passenger",
            };
          }
        }
      }
    } else {
      console.log("listOfPassangerWs is null or empty");
      return { message: "error", error: "No passengers available" };
    }

    return {
      message: "success",
      data: "Message to passenger sent successfully",
    };
  } catch (error) {
    console.log("error in sendNotificationToPassenger", error);
    return { message: "error", data: "Message can't be sent to passenger" };
  }
};

// send notification to admin
const sendNotificationToAdmin = async ({ message, phoneNumber }) => {
  try {
    // Send notification to the matching admin using a for...of loop
    console.log("listOfAdminWs", listOfAdminWs);
    console.log("listOfAdminWs length", listOfAdminWs.length);
    if (listOfAdminWs && listOfAdminWs.length > 0) {
      const errorList = [],
        successList = [];
      for (const admin of listOfAdminWs) {
        if (admin && admin?.WS) {
          try {
            const res = await WSServerTextMessageResponder(admin.WS, message);
            if (res.message === "error") {
              errorList.push({
                message: "error",
                data: "Message can't be sent to admin",
                errorOnData: message,
              });
            } else if (res.message === "success") {
              successList.push({
                message: "success",
                data: "Message to admin sent successfully",
                successOnData: message,
              });
            }
            return {
              message: successList.length > 0 ? "success" : "error",
              data:
                successList.length > 0
                  ? "Message sent successfully"
                  : "Message can't be sent to admin",
              error: errorList,
              success: successList,
            };
          } catch (error) {
            console.log("Error sending message to admin:", error);
            return {
              message: "error",
              error: "An error occurred while sending a message to admin",
            };
          }
        } else {
        }
      }
    } else {
    }

    // If loop completes without error
    return {
      message: "success",
      data: "Message to admin sent successfully",
    };
  } catch (error) {
    console.log("Error in sendNotificationToAdmin:", error);
    return { message: "error", error: "Message can't be sent to admin" };
  }
};

module.exports = {
  sendNotificationToAdmin,
  sendNotificationToDriver,
  sendNotificationToPassenger,
};
