const { testGetRoles, testRolesWorkFlows } = require("../Roles");
const {
  testVehicleTypeWorkflow,
  testVehicleStatusTypeWorkflow,
  testVehicleStatusWorkflow,
} = require("../Vehicles");
const {
  testJourneyStatusWorkflow,
  testCancellationReasonsTypeWorkflow,
} = require("../Journey");
const {
  testDocumentTypesWorkflow,
  testRoleDocumentRequirementsWorkflow,
} = require("../Documents");
const { testStatusWorkflow } = require("../Status");
const {
  testDelinquencyTypesWorkflows,
} = require("../Delinquency/DelinquencyTypes");
const {
  testTariffRateWorkflow,
  testDepositSourceWorkflow,
  testFinancialInstitutionAccountWorkflow,
  testSubscriptionPlanWorkflow,
  testCommissionStatusWorkflow,
  testPaymentStatusWorkflow,
  testPaymentMethodWorkflow,
  testCommissionRatesWorkflow,
  testSubscriptionPlanPricingWorkflow,
  testTariffRateForVehicleTypeWorkflow,
  testUserRefundWorkflow,
  testDriverEarningWorkflow,
} = require("../Finance");
const { testSMSSenderWorkflow } = require("../Admin/SMSSender");
const { testCompanyRoleWorkflow } = require("../Company");
const { testUserRoleWorkflow } = require("../Admin");
const { usersData } = require("../constants");

const runReferenceCRUD = async () => {
  console.log("\n=======================================================");
  console.log("   📋 REFERENCE DATA CRUD TESTS");
  console.log("=======================================================\n");

  await testVehicleTypeWorkflow({});
  await testVehicleStatusTypeWorkflow({});
  await testJourneyStatusWorkflow({});
  await testCancellationReasonsTypeWorkflow({});
  await testDocumentTypesWorkflow({});
  await testRoleDocumentRequirementsWorkflow({});
  await testStatusWorkflow({});
  await testDelinquencyTypesWorkflows({});
  await testTariffRateWorkflow({});
  await testDepositSourceWorkflow({});
  await testFinancialInstitutionAccountWorkflow({});
  await testCommissionStatusWorkflow({});
  await testPaymentStatusWorkflow({});
  await testPaymentMethodWorkflow({});
  await testCommissionRatesWorkflow({});
  await testSubscriptionPlanWorkflow({});
  await testSubscriptionPlanPricingWorkflow({});
  await testTariffRateForVehicleTypeWorkflow({});
  await testRolesWorkFlows();
  await testSMSSenderWorkflow({});
  await testCompanyRoleWorkflow({});
  await testVehicleStatusWorkflow({});
  await testUserRefundWorkflow({ user: usersData.admin });
  await testDriverEarningWorkflow({ user: usersData.driver });
  await testUserRoleWorkflow({ user: usersData.admin });

  console.log("\n✅ Reference data CRUD complete\n");
};

module.exports = { runReferenceCRUD };
