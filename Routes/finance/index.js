const express = require("express");

// Import all financial routes
const userBalanceRoutes = require("./UserBalance.routes");
const userBalanceTransferRoutes = require("./UserBalanceTransfer.routes");
const userDepositRoutes = require("./UserDeposit.routes");
const userRefundRoutes = require("./UserRefund.routes");
const userSubscriptionRoutes = require("./UserSubscription.routes");

// Commission and earnings
const commissionRoutes = require("./Commission.routes");
const commissionRatesRoutes = require("./CommissionRates.routes");
const commissionStatusRoutes = require("./CommissionStatus.routes");
const driverEarningRoutes = require("./DriverEarning.routes");

// Payment related
const paymentMethodRoutes = require("./PaymentMethod.routes");
const paymentStatusRoutes = require("./PaymentStatus.routes");
const paymentsRoutes = require("./Payments.routes");
const journeyPaymentsRoutes = require("./JourneyPayments.routes");

// Subscription and pricing
const subscriptionPlanRoutes = require("./SubscriptionPlan.routes");
const subscriptionPlanPricingRoutes = require("./SubscriptionPlanPricing.routes");

// Financial institutions and sources
const depositSourceRoutes = require("./DepositSource.routes");
const financialInstitutionAccountRoutes = require("./FinancialInstitutionAccount.routes");

const router = express.Router();
const tariffRateRoutes = require("./TariffRate.routes");

const { USER_BALANCE_ENDPOINTS } = require("../EndPoints/userBalance.endpoints");
const { USER_BALANCE_TRANSFER_ENDPOINTS } = require("../EndPoints/userBalanceTransfer.endpoints");
const { USER_DEPOSIT_ENDPOINTS } = require("../EndPoints/userDeposit.endpoints");
const { USER_REFUND_ENDPOINTS } = require("../EndPoints/userRefund.endpoints");
const { USER_SUBSCRIPTION_ENDPOINTS } = require("../EndPoints/userSubscription.endpoints");
const { COMMISSION_ENDPOINTS } = require("../EndPoints/commission.endpoints");
const { COMMISSION_RATES_ENDPOINTS } = require("../EndPoints/commissionRates.endpoints");
const { COMMISSION_STATUS_ENDPOINTS } = require("../EndPoints/commissionStatus.endpoints");
const { DRIVER_EARNING_ENDPOINTS } = require("../EndPoints/driverEarning.endpoints");
const { PAYMENT_METHOD_ENDPOINTS } = require("../EndPoints/paymentMethod.endpoints");
const { PAYMENT_STATUS_ENDPOINTS } = require("../EndPoints/paymentStatus.endpoints");
const { PAYMENTS_ENDPOINTS } = require("../EndPoints/payments.endpoints");
const { JOURNEY_PAYMENTS_ENDPOINTS } = require("../EndPoints/journeyPayments.endpoints");
const { SUBSCRIPTION_PLAN_ENDPOINTS } = require("../EndPoints/subscriptionPlan.endpoints");
const { SUBSCRIPTION_PLAN_PRICING_ENDPOINTS } = require("../EndPoints/subscriptionPlanPricing.endpoints");
const { DEPOSIT_SOURCE_ENDPOINTS } = require("../EndPoints/depositSource.endpoints");
const { FINANCIAL_INSTITUTION_ACCOUNT_ENDPOINTS } = require("../EndPoints/financialInstitutionAccount.endpoints");
const { TARIFF_RATE_ENDPOINTS } = require("../EndPoints/tariffRate.endpoints");

// Mount all financial routes with appropriate prefixes
router.use(USER_BALANCE_ENDPOINTS.MOUNT, userBalanceRoutes);
router.use(USER_BALANCE_TRANSFER_ENDPOINTS.MOUNT, userBalanceTransferRoutes);
router.use(USER_DEPOSIT_ENDPOINTS.MOUNT, userDepositRoutes);
router.use(USER_REFUND_ENDPOINTS.MOUNT, userRefundRoutes);
router.use(USER_SUBSCRIPTION_ENDPOINTS.MOUNT, userSubscriptionRoutes);

// Commission and earnings
router.use(COMMISSION_ENDPOINTS.MOUNT, commissionRoutes);
router.use(COMMISSION_RATES_ENDPOINTS.MOUNT, commissionRatesRoutes);
router.use(COMMISSION_STATUS_ENDPOINTS.MOUNT, commissionStatusRoutes);
router.use(DRIVER_EARNING_ENDPOINTS.MOUNT, driverEarningRoutes);

// Payment related
router.use(PAYMENT_METHOD_ENDPOINTS.MOUNT, paymentMethodRoutes);
router.use(PAYMENT_STATUS_ENDPOINTS.MOUNT, paymentStatusRoutes);
router.use(PAYMENTS_ENDPOINTS.MOUNT, paymentsRoutes);
router.use(JOURNEY_PAYMENTS_ENDPOINTS.MOUNT, journeyPaymentsRoutes);

// Subscription and pricing
router.use(SUBSCRIPTION_PLAN_ENDPOINTS.MOUNT, subscriptionPlanRoutes);
router.use(SUBSCRIPTION_PLAN_PRICING_ENDPOINTS.MOUNT, subscriptionPlanPricingRoutes);

// Financial institutions and sources
router.use(DEPOSIT_SOURCE_ENDPOINTS.MOUNT, depositSourceRoutes);
router.use(FINANCIAL_INSTITUTION_ACCOUNT_ENDPOINTS.MOUNT, financialInstitutionAccountRoutes);

// Gifts and bonuses
router.use(TARIFF_RATE_ENDPOINTS.MOUNT, tariffRateRoutes);
module.exports = router;
