const { testDelinquencyWorkflow } = require("../Delinquency/Delinquency");
const {
  testDelinquencyResponseWorkflow,
} = require("../Delinquency/DelinquencyResponse");
const { testAdminDecisionWorkflow } = require("../Delinquency/AdminDecision");
const { testBanWorkflow } = require("../Delinquency/BannedUsers");
const { testCompanyDelinquencyWorkflow } = require("../Company");
const { usersData } = require("../constants");

const runDelinquencyTests = async () => {
  console.log("\n=======================================================");
  console.log("   ⚠️  DELINQUENCY LIFECYCLE TESTS");
  console.log("=======================================================\n");

  await testDelinquencyWorkflow({ user: usersData.admin });
  await testDelinquencyResponseWorkflow({ user: usersData.driver });
  await testAdminDecisionWorkflow({ user: usersData.admin });
  await testBanWorkflow({ user: usersData.admin });
  await testCompanyDelinquencyWorkflow({});

  console.log("\n✅ Delinquency lifecycle tests complete\n");
};

module.exports = { runDelinquencyTests };
