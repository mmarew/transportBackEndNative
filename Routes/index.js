// const Routes = require("express").Router();
// const WSSMSSenderRouter = require("./SMSSender.routes");
// const vehicleType = require("./VehicleType.routes");
// const CancilationRouter = require("./CancilationReasonsType.routes");
// const AdminRouter = require("./Admin.routes");
// const userRoutes = require("./User.routes");
// const roles = require("./Role.routes");
// const Status = require("./Status.routes");
// const vehicleStatusRoutes = require("./VehicleStatus.routes");
// const Vehicles = require("./Vehicle.routes");
// const vehicleOwnership = require("./VehicleOwnership.routes");
// const Passenger = require("./PassengerRequest.routes");
// const Driver = require("./DriverRequest.routes");
// const vehicleStatusType = require("./VehicleStatusType.routes");
// const userRole = require("./UserRole.routes");
// const UserStatuses = require("./UserStatuse.routes");
// const UserRoleStatus = require("./UserRoleStatus.routes");
// const documentTypes = require("./DocumentTypes.routes");
// const attachedDocuments = require("./AttachedDocuments.routes");
// const RoleDocumentRequirements = require("./RoleDocumentRequirements.routes");
// const database = require("./Database.routes");
// const journeyStatus = require("./JourneyStatus.routes");
// const canceledJourney = require("./CanceledJourneys.routes");
// const JourneyRoutePoints = require("./JourneyRoutePoints.routes");
// const paymentMethod = require("./PaymentMethod.routes");
// const Journey = require("./Journey.routes");
// const JourneyDecision = require("./JourneyDecisions.routes");
// const Rating = require("./Ratings.routes");
// const payments = require("./Payments.routes");
// const TarrifRate = require("./TarrifRate.routes");
// const driverBalance = require("./DriverBalance.routes");

// const TarrifRateForVehcleTypes = require("./TarrifRateForVehcleTypes.routes");
// const CommissionRates = require("./CommissionRates.routes");
// const Commission = require("./Commission.routes");
// const paymentStatus = require("./PaymentStatus.routes");

// const DriverDeposit = require("./DriverDeposit.routes");
// const subscriptionPlan = require("./SubscriptionPlan.route");
// const SubscriptionPlanPricing = require("./SubscriptionPlanPricing.route");
// const driverSubscription = require("./DriverSubscription.route");
// const routesArray = [
//   require("./DriverSubscription.route"),
//   // driverSubscription,
//   SubscriptionPlanPricing,
//   subscriptionPlan,
//   DriverDeposit,
//   paymentStatus,
//   paymentStatus,
//   Commission,
//   CommissionRates,
//   TarrifRateForVehcleTypes,
//   driverBalance,
//   TarrifRate,
//   payments,
//   Rating,
//   JourneyDecision,
//   Journey,
//   paymentMethod,
//   JourneyRoutePoints,
//   canceledJourney,
//   journeyStatus,
//   database,
//   RoleDocumentRequirements,
//   attachedDocuments,
//   documentTypes,
//   UserRoleStatus,
//   UserStatuses,
//   userRole,
//   vehicleStatusType,
//   Driver,
//   Passenger,
//   vehicleOwnership,
//   Vehicles,
//   vehicleStatusRoutes,
//   Status,
//   roles,
//   userRoutes,
//   AdminRouter,
//   CancilationRouter,
//   vehicleType,
//   WSSMSSenderRouter,
// ];
// routesArray.map((route) => {
//   Routes.use(route);
// });

// module.exports = Routes;
const Routes = require("express").Router();

const routesArray = [
  require("./DriverSubscription.route"),
  require("./SubscriptionPlanPricing.route"),
  require("./SubscriptionPlan.route"),
  require("./DriverDeposit.routes"),
  require("./PaymentStatus.routes"),
  require("./Commission.routes"),
  require("./CommissionRates.routes"),
  require("./TarrifRateForVehcleTypes.routes"),
  require("./DriverBalance.routes"),
  require("./TarrifRate.routes"),
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
  require("./CancilationReasonsType.routes"),
  require("./VehicleType.routes"),
  require("./SMSSender.routes"),
];

// Register all routes
routesArray.map((route) => {
  Routes.use(route);
});

module.exports = Routes;
