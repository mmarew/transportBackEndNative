const backendURL = "http://127.0.0.1:3000";

const usersData = {
  driver: {
    fullName: "Test User", // Schema expects fullName, not full_name
    email: "testemail11@test.com",
    phoneNumber: "+251991111111",
    roleId: 2, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    OTP: 101010, // Schema requires an OTP for verification}
    documentAndVehicleOfDriver: null,
  },
  shipper: {
    fullName: "Test Shipper", // Schema expects fullName, not full_name
    email: "testemail22@test.com",
    phoneNumber: "+251992222222",
    roleId: 1, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    OTP: 101010, // Schema requires an OTP for verification}
  },
  admin: {
    fullName: "Test Admin", // Schema expects fullName, not full_name
    email: "testemail33@test.com",
    phoneNumber: "+251993333333",
    roleId: 3, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    OTP: 101010, // Schema requires an OTP for verification}
  },
};
const userToken = { driver: undefined, shipper: undefined, admin: undefined };

module.exports = { userToken, backendURL, usersData };
