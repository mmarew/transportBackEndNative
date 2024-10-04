const {
  listOfDriverWs,
  WSServerTextMessageResponder,
  listOfPassangerWs,
} = require("./WsServerResponder");

// Regular expression to validate phone numbers (only digits, between 9 and 15 digits)
const phoneNumberRegex = /^[0-9]{9,15}$/;

// Function to clean phone numbers (remove spaces and + sign)
const cleanPhoneNumber = (phoneNumber) => {
  return phoneNumber.replace(/\D/g, "");
};

// Send notification to the driver based on the phone number
const sendNotificationToDriver = async ({ message, phoneNumber }) => {
  // Clean the phone number before processing
  const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

  // Validate the cleaned phone number using regex
  if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
    console.log("Invalid phone number format for driver:", cleanedPhoneNumber);
    return { message: "error", data: "Invalid phone number format" };
  }

  // Send notification to the matching driver
  listOfDriverWs.forEach((driver) => {
    if (driver.phoneNumber === cleanedPhoneNumber) {
      console.log("sendNotificationToDriver===>", driver);
      try {
        WSServerTextMessageResponder(driver.WS, message);
      } catch (error) {
        console.error("Error sending message to driver:", error);
      }
    }
  });

  return { message: "success", data: "Request accepted successfully" };
};

// Send notification to the passenger based on the phone number
const sendNotificationToPassenger = async ({ message, phoneNumber }) => {
  // Clean the phone number before processing
  const cleanedPhoneNumber = cleanPhoneNumber(phoneNumber);

  // Validate the cleaned phone number using regex
  if (!phoneNumberRegex.test(cleanedPhoneNumber)) {
    console.log(
      "Invalid phone number format for passenger:",
      cleanedPhoneNumber
    );
    return { message: "error", data: "Invalid phone number format" };
  }

  // Send notification to the matching passenger
  if (listOfPassangerWs && listOfPassangerWs.length > 0) {
    listOfPassangerWs.forEach((passenger) => {
      if (passenger && passenger.phoneNumber === cleanedPhoneNumber) {
        if (passenger.WS) {
          try {
            WSServerTextMessageResponder(passenger.WS, message);
          } catch (error) {
            console.error("Error sending message to passenger:", error);
          }
        } else {
          console.log("passenger.WS is null");
        }
      }
    });
  } else {
    console.log("listOfPassangerWs is null or empty");
  }

  return { message: "success", data: "Request accepted successfully" };
};

module.exports = {
  sendNotificationToDriver,
  sendNotificationToPassenger,
};
