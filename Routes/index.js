const Routes = require("express").Router();

const routesArray = [
  require("./DriverEarning.routes"),
  require("./FreeGiftToDriver.route"),
  require("./FinancialInstitutionAccount.route"),
  require("./DriverRefund.route"),
  require("./DriverBalanceTransfer.route"),
  require("./DepositSource.route"),
  require("./DriverSubscription.route"),
  require("./SubscriptionPlanPricing.route"),
  require("./SubscriptionPlan.route"),
  require("./DriverDeposit.routes"),
  require("./PaymentStatus.routes"),
  require("./Commission.routes"),
  require("./CommissionRates.routes"),
  require("./TariffRateForVehcleTypes.routes"),
  require("./DriverBalance.routes"),
  require("./TariffRate.routes"),
  require("./Payments.routes"),
  require("./Ratings.routes"),
  require("./JourneyDecisions.routes"),
  require("./Journey.routes"),
  require("./PaymentMethod.routes"),
  require("./JourneyRoutePoints.routes"),
  require("./CanceledJourneys.routes"),
  require("./JourneyStatus.routes"),
  require("./Database.routes"),
  require("./RoleDocumentRequirements.routes"),
  require("./AttachedDocuments.routes"),
  require("./DocumentTypes.routes"),
  require("./UserRoleStatus.routes"),
  require("./UserStatuse.routes"),
  require("./UserRole.routes"),
  require("./VehicleStatusType.routes"),
  require("./DriverRequest.routes"),
  require("./PassengerRequest.routes"),
  require("./VehicleOwnership.routes"),
  require("./Vehicle.routes"),
  require("./VehicleStatus.routes"),
  require("./Status.routes"),
  require("./Role.routes"),
  require("./User.routes"),
  require("./Admin.routes"),
  require("./CancellationReasonsType.routes"),
  require("./VehicleType.routes"),
  require("./SMSSender.routes"),
  require("./Firebase.routes"),
  require("./UserDelinquency.routes"),
  require("./BannedUsers.routes"),
  require("./DelinquencyTypes.routes"),
];

// Register all routes
routesArray.map((route) => {
  Routes.use(route);
});

module.exports = Routes;
