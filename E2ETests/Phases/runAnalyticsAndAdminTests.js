const {
  testAnalyticsWorkflow,
  testSystemAdminWorkflow,
} = require("../Analytics");
const { testAdminDashboardFlow } = require("../Admin");
const { usersData } = require("../constants");

const runAnalyticsAndAdminTests = async () => {
  console.log("\n=======================================================");
  console.log("   📈 ANALYTICS & SYSTEM ADMIN TESTS");
  console.log("=======================================================\n");

  await testAnalyticsWorkflow({ user: usersData.admin });
  await testSystemAdminWorkflow({ user: usersData.admin });
  await testAdminDashboardFlow();

  console.log("\n✅ Analytics & Admin tests complete\n");
};

module.exports = { runAnalyticsAndAdminTests };
