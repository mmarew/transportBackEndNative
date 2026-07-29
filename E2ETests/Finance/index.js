// Finance E2E Tests Export

const {
  testPaymentsWorkflow, testGetPayments, testGetPaymentById, testCreatePayment, testUpdatePayment, testDeletePayment, testGetPaymentsByDateRange,
  testPaymentMethodWorkflow, testGetPaymentMethods, testCreatePaymentMethod, testUpdatePaymentMethod, testDeletePaymentMethod,
  testPaymentStatusWorkflow, testGetPaymentStatuses, testCreatePaymentStatus, testUpdatePaymentStatus, testDeletePaymentStatus,
  testJourneyPaymentsWorkflow, testGetJourneyPayments, testGetJourneyPaymentById, testCreateJourneyPayment, testUpdateJourneyPayment, testDeleteJourneyPayment,
} = require("./Payments");

const {
  testCommissionWorkflow, testGetCommissions, testCreateCommission, testUpdateCommission, testDeleteCommission,
  testCommissionRatesWorkflow, testGetCommissionRates, testCreateCommissionRate, testUpdateCommissionRate, testDeleteCommissionRate,
  testCommissionStatusWorkflow, testGetCommissionStatuses, testCreateCommissionStatus, testUpdateCommissionStatus, testDeleteCommissionStatus,
  testDriverEarningWorkflow, testGetDriverEarnings,
} = require("./Commissions");

const {
  testSubscriptionPlanWorkflow, testGetSubscriptionPlans, testCreateSubscriptionPlan, testUpdateSubscriptionPlan, testDeleteSubscriptionPlan,
  testSubscriptionPlanPricingWorkflow, testGetSubscriptionPlanPricings, testCreateSubscriptionPlanPricing, testUpdateSubscriptionPlanPricing, testDeleteSubscriptionPlanPricing,
  testCreateUserSubscription, testGetUserSubscriptions, testUpdateUserSubscription, testDeleteUserSubscription,
} = require("./Subscriptions");

const {
  testCreateUserBalance, testGetUserBalance, runUserBalanceTests,
  testCreateUserBalanceTransfer, testGetUserBalanceTransfers, testGetUserBalanceTransferById, testUpdateUserBalanceTransfer, testDeleteUserBalanceTransfer, testGetBalanceTransfersFrom, testGetBalanceTransfersTo,
  testCreateUserDeposit, testGetUserDeposits, testUpdateUserDeposit, testDeleteUserDeposit, testInitiateSantimPay, testSantimPayWebhook,
} = require("./Balance");

const {
  testUserRefundWorkflow, testGetUserRefunds, testCreateUserRefund, testUpdateUserRefund, testDeleteUserRefund,
} = require("./UserRefund");

const {
  testDepositSourceWorkflow, testGetDepositSources, testGetDepositSourceById, testCreateDepositSource, testUpdateDepositSource, testDeleteDepositSource,
  testFinancialInstitutionAccountWorkflow, testGetFinancialInstitutionAccounts, testCreateFinancialInstitutionAccount, testUpdateFinancialInstitutionAccount, testDeleteFinancialInstitutionAccount,
  testRatingsWorkflow, testGetRatings, testCreateRating, testUpdateRating, testDeleteRating,
  testTariffRateWorkflow, testGetTariffRates, testCreateTariffRate, testUpdateTariffRate, testDeleteTariffRate,
  testTariffRateForVehicleTypeWorkflow, testGetTariffRatesForVehicleTypes, testCreateTariffRateForVehicleType, testUpdateTariffRateForVehicleType, testDeleteTariffRateForVehicleType,
} = require("./ReferenceData");

module.exports = {
  testPaymentsWorkflow, testGetPayments, testGetPaymentById, testCreatePayment, testUpdatePayment, testDeletePayment, testGetPaymentsByDateRange,
  testPaymentMethodWorkflow, testGetPaymentMethods, testCreatePaymentMethod, testUpdatePaymentMethod, testDeletePaymentMethod,
  testPaymentStatusWorkflow, testGetPaymentStatuses, testCreatePaymentStatus, testUpdatePaymentStatus, testDeletePaymentStatus,
  testJourneyPaymentsWorkflow, testGetJourneyPayments, testGetJourneyPaymentById, testCreateJourneyPayment, testUpdateJourneyPayment, testDeleteJourneyPayment,
  testCommissionWorkflow, testGetCommissions, testCreateCommission, testUpdateCommission, testDeleteCommission,
  testCommissionRatesWorkflow, testGetCommissionRates, testCreateCommissionRate, testUpdateCommissionRate, testDeleteCommissionRate,
  testCommissionStatusWorkflow, testGetCommissionStatuses, testCreateCommissionStatus, testUpdateCommissionStatus, testDeleteCommissionStatus,
  testDriverEarningWorkflow, testGetDriverEarnings,
  testSubscriptionPlanWorkflow, testGetSubscriptionPlans, testCreateSubscriptionPlan, testUpdateSubscriptionPlan, testDeleteSubscriptionPlan,
  testSubscriptionPlanPricingWorkflow, testGetSubscriptionPlanPricings, testCreateSubscriptionPlanPricing, testUpdateSubscriptionPlanPricing, testDeleteSubscriptionPlanPricing,
  testCreateUserSubscription, testGetUserSubscriptions, testUpdateUserSubscription, testDeleteUserSubscription,
  testCreateUserBalance, testGetUserBalance, runUserBalanceTests,
  testCreateUserBalanceTransfer, testGetUserBalanceTransfers, testGetUserBalanceTransferById, testUpdateUserBalanceTransfer, testDeleteUserBalanceTransfer, testGetBalanceTransfersFrom, testGetBalanceTransfersTo,
  testCreateUserDeposit, testGetUserDeposits, testUpdateUserDeposit, testDeleteUserDeposit, testInitiateSantimPay, testSantimPayWebhook,
  testUserRefundWorkflow, testGetUserRefunds, testCreateUserRefund, testUpdateUserRefund, testDeleteUserRefund,
  testDepositSourceWorkflow, testGetDepositSources, testGetDepositSourceById, testCreateDepositSource, testUpdateDepositSource, testDeleteDepositSource,
  testFinancialInstitutionAccountWorkflow, testGetFinancialInstitutionAccounts, testCreateFinancialInstitutionAccount, testUpdateFinancialInstitutionAccount, testDeleteFinancialInstitutionAccount,
  testRatingsWorkflow, testGetRatings, testCreateRating, testUpdateRating, testDeleteRating,
  testTariffRateWorkflow, testGetTariffRates, testCreateTariffRate, testUpdateTariffRate, testDeleteTariffRate,
  testTariffRateForVehicleTypeWorkflow, testGetTariffRatesForVehicleTypes, testCreateTariffRateForVehicleType, testUpdateTariffRateForVehicleType, testDeleteTariffRateForVehicleType,
};
