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
// Mount all financial routes with appropriate prefixes
router.use("/userBalance", userBalanceRoutes);
router.use("/userBalanceTransfer", userBalanceTransferRoutes);
router.use("/userDeposit", userDepositRoutes);
router.use("/userRefund", userRefundRoutes);
router.use("/userSubscription", userSubscriptionRoutes);

// Commission and earnings
router.use("/commission", commissionRoutes);
router.use("/commissionRates", commissionRatesRoutes);
router.use("/commissionStatus", commissionStatusRoutes);
router.use("/driverEarning", driverEarningRoutes);

// Payment related
router.use("/paymentMethod", paymentMethodRoutes);
router.use("/paymentStatus", paymentStatusRoutes);
router.use("/payments", paymentsRoutes);
router.use("/journeyPayments", journeyPaymentsRoutes);

// Subscription and pricing
router.use("/subscriptionPlan", subscriptionPlanRoutes);
router.use("/subscriptionPlanPricing", subscriptionPlanPricingRoutes);

// Financial institutions and sources
router.use("/depositSource", depositSourceRoutes);
router.use("/financialInstitutionAccount", financialInstitutionAccountRoutes);

// Gifts and bonuses
router.use("/tariffRate", tariffRateRoutes);
module.exports = router;
