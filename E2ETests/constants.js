const { usersRoles } = require("../Utils/ListOfSeedData");

const backendURL = "http://127.0.0.1:3000";

const usersData = {
  driver: {
    fullName: "Test User", // Schema expects fullName, not full_name
    email: "testemail12@test.com",
    phoneNumber: "+251991111112",
    roleId: usersRoles.driverRoleId, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    OTP: 101010, // Schema requires an OTP for verification}
    documentAndVehicleOfDriver: null,
  },
  shipper: {
    fullName: "Test Shipper", // Schema expects fullName, not full_name
    email: "testemail22@test.com",
    phoneNumber: "+251992222222",
    roleId: usersRoles.shipperRoleId, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    OTP: 101010, // Schema requires an OTP for verification}
  },
  admin: {
    fullName: "Test Admin", // Schema expects fullName, not full_name
    email: "testemail33@test.com",
    phoneNumber: "+251993333333",
    roleId: usersRoles.adminRoleId, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    statusId: 1, // USER_STATUS.ACTIVE
    OTP: 101010, // Schema requires an OTP for verification}
  },
  companyAdmin: {
    fullName: "Test Company Admin", // Schema expects fullName, not full_name
    email: "testemail44@test.com",
    phoneNumber: "+251994444444",
    roleId: usersRoles.companyAdminRoleId, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    OTP: 101010, // Schema requires an OTP for verification}
    availableBids: null,
    submittedBid: null,
    companies: null,
    acceptedByShipperBids: null,
    acceptedByCompanyBids: null,
  },
  supperAdmin: {
    fullName: "Test Supper Admin", // Schema expects fullName, not full_name
    // email: "testemail55@test.com",
    phoneNumber: "+251983222221",
    roleId: usersRoles.supperAdminRoleId, // Schema requires roleId (e.g., 2 for Shipper, 3 for Driver)
    OTP: 101010, // Schema requires an OTP for verification}
  },
};
const unAuthorizedDriver = { driver: null };
const shipperRequestStatusData = { data: null };
const userToken = {
  driver: undefined,
  shipper: undefined,
  admin: undefined,
  companyAdmin: undefined,
};

module.exports = {
  userToken,
  backendURL,
  usersData,
  unAuthorizedDriver,
  shipperRequestStatusData,
};
