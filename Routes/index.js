const Routes = require("express").Router();

const routesArray = [
  { path: "/api/finance", handler: require("./finance") }, // All financial routes consolidated
  require("./TariffRateForVehicleTypes.routes"),
  require("./Ratings.routes"),
  require("./JourneyDecisions.routes"),
  require("./Journey.routes"),
  require("./JourneyRoutePoints.routes"),
  require("./CanceledJourneys.routes"),
  require("./JourneyStatus.routes"),
  require("./PassengerRequestBatch.routes"),
  require("./Database.routes"),
  require("./RoleDocumentRequirements.routes"),
  require("./AttachedDocuments.routes"),
  require("./DocumentTypes.routes"),
  require("./UserRoleStatus.routes"),
  require("./UserStatus.routes"),
  require("./UserRole.routes"),
  require("./VehicleStatusType.routes"),
  (() => {
    try {
      return require("./DriverRequest.routes");
    } catch (error) {
      console.error("ERROR LOADING DriverRequest.routes:", error.message);
      console.error(error.stack);
      throw error;
    }
  })(),
  (() => {
    try {
      return require("./PassengerRequest.routes");
    } catch (error) {
      console.error("ERROR LOADING PassengerRequest.routes:", error.message);
      console.error(error.stack);
      throw error;
    }
  })(),
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
  require("./CompanyDelinquency.routes"),
  require("./CompanyRating.routes"),
  require("./DelinquencyTypes.routes"),
  require("./VehicleDriver.routes"),
  require("./Account.routes"),
  require("./Health.routes"),
  // Modular Company Routes
  { path: "/api/company", handler: require("./company") },
];

// Register all routes
routesArray.forEach((route) => {
  if (typeof route === "object" && route.path && route.handler) {
    Routes.use(route.path, route.handler);
  } else {
    Routes.use(route);
  }
});

module.exports = Routes;
