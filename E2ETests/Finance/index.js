// Finance E2E Tests Export

const { testCommissionStatusWorkflow, testGetCommissionStatuses } = require("./CommissionStatus");
const { testTariffRateWorkflow, testGetTariffRates } = require("./TariffRate");
const { testDepositSourceWorkflow, testGetDepositSources } = require("./DepositSource");
const { testFinancialInstitutionAccountWorkflow, testGetFinancialInstitutionAccounts } = require("./FinancialInstitutionAccount");
const { testSubscriptionPlanWorkflow, testGetSubscriptionPlans } = require("./SubscriptionPlan");
const { testRatingsWorkflow, testGetRatings } = require("./Ratings");

module.exports = {
  testCommissionStatusWorkflow,
  testGetCommissionStatuses,
  testTariffRateWorkflow,
  testGetTariffRates,
  testDepositSourceWorkflow,
  testGetDepositSources,
  testFinancialInstitutionAccountWorkflow,
  testGetFinancialInstitutionAccounts,
  testSubscriptionPlanWorkflow,
  testGetSubscriptionPlans,
  testRatingsWorkflow,
  testGetRatings,
};
