const { usersRoles } = require("../Utils/ListOfSeedData");

const backendURL = "http://127.0.0.1:3000";

// Unique run identifier — makes phone numbers and emails unique per test run
// so multiple runs can coexist in the same database without conflicts.
const runId = String(Date.now()).slice(-6);

const usersData = {
  driver: {
    fullName: "Test User",
    email: `testdriver+${runId}@test.com`,
    phoneNumber: `+25199${runId}1`,
    roleId: usersRoles.driverRoleId,
    OTP: 101010,
    documentAndVehicleOfDriver: null,
    token: null,
    accountData: null,
  },
  shipper: {
    fullName: "Test Shipper",
    email: `testshipper+${runId}@test.com`,
    phoneNumber: `+25198${runId}2`,
    roleId: usersRoles.shipperRoleId,
    OTP: 101010,
    token: null,
  },
  admin: {
    fullName: "Test Admin",
    email: `testadmin+${runId}@test.com`,
    phoneNumber: `+25197${runId}3`,
    roleId: usersRoles.adminRoleId,
    statusId: 1,
    OTP: 101010,
    token: null,
  },
  companyAdmin: {
    fullName: "Test Company Admin",
    email: `testcompanyadmin+${runId}@test.com`,
    phoneNumber: `+25196${runId}4`,
    roleId: usersRoles.companyAdminRoleId,
    OTP: 101010,
    token: null,
    bids: {
      availableBids: null,
      submitted: null,
      companies: null,
      accepted_by_shipper: null,
      acceptedByCompanyBids: null,
      rejected_by_shipper: null,
      cancelled_by_company: null,
    },
  },
  supperAdmin: {
    fullName: "Test Supper Admin",
    email: "supperAdmin@supperAdmin.com",
    phoneNumber: "+251983222221", // Fixed — pre-seeded in the database
    roleId: usersRoles.supperAdminRoleId,
    OTP: 101010,
  },
  token: null,
  company: {
    companyName: `company-a-${runId}`,
    companyRegistrationNumber: `no-aa3a-${Date.now()}`,
    companyPhone: `+25195${runId}5`,
    companyEmail: `companya+${Date.now()}@gmail.com`,
    companyAddress: "Addis Ababa",
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
const listOfDelinquencyTypes = { data: null };
const listOfRoles = { data: null };
const listOfPlanPricing = { data: null };
module.exports = {
  listOfPlanPricing,
  listOfRoles,
  listOfDelinquencyTypes,
  userToken,
  backendURL,
  usersData,
  unAuthorizedDriver,
  shipperRequestStatusData,
};
