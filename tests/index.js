// const { testDriverOnboardingFlow } = require("./Driver");

// testDriverOnboardingFlow({ userType: "driver" });
const { testCreateAdminFlow } = require("./Admin");
const { authorizeDriversDocuments } = require("./Admin/AuthorizeDocs");
const { fetchUnAuthorizedDrivers } = require("./Admin/fetchData");
const { usersData } = require("./constants");

const initiateTest = async () => {
  await testCreateAdminFlow();
  await fetchUnAuthorizedDrivers();
  await authorizeDriversDocuments();
};
initiateTest();
