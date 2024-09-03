const {
  listOfDriverWs,
  WSServerTextMessageResponder,
  listOfPassangerWs,
} = require("./WsServerResponder");

const sendNotificationToDriver = async ({ message, phoneNumber }) => {
  listOfDriverWs.forEach((driver) => {
    if (driver.phoneNumber == phoneNumber) {
      WSServerTextMessageResponder(driver.WS, message);
    }
  });
  return { message: "success", data: "Request accepted successfully" };
};
const sendNotificationToPassenger = async ({ message, phoneNumber }) => {
  console.log("phoneNumber ==========>", phoneNumber);
  listOfPassangerWs.forEach((passenger) => {
    if (passenger.phoneNumber == phoneNumber) {
      WSServerTextMessageResponder(passenger.WS, message);
    }
  });
  return { message: "success", data: "Request accepted successfully" };
};
module.exports = {
  sendNotificationToDriver,
  sendNotificationToPassenger,
};
