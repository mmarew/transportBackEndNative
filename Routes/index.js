const Routes = require("express").Router();

const routesArray = [
  { path: "/api/finance", handler: require("./finance") }, // All financial routes consolidated
  // ── Single-prefix routes (industry-standard: mounted with base prefix) ──
  {
    path: "/api/admin/tariffRateForVehicleType",
    handler: require("./TariffRateForVehicleTypes.routes"),
  },
  { path: "/api/ratings", handler: require("./Ratings.routes") },
  {
    path: "/api/journeyRoutePoints",
    handler: require("./JourneyRoutePoints.routes"),
  },
  {
    path: "/api/shipperRequestBatch",
    handler: require("./ShipperRequestBatch.routes"),
  },
  {
    path: "/api/RoleDocumentRequirements",
    handler: require("./RoleDocumentRequirements.routes"),
  },
  { path: "/api/documentTypes", handler: require("./DocumentTypes.routes") },
  {
    path: "/api/admin/userRoleStatus",
    handler: require("./UserRoleStatus.routes"),
  },
  { path: "/api/admin/userStatuses", handler: require("./UserStatus.routes") },
  { path: "/api/admin/userRole", handler: require("./UserRole.routes") },
  { path: "/api/admin/vehicleTypes", handler: require("./VehicleType.routes") },
  { path: "/api/vehicleDriver", handler: require("./VehicleDriver.routes") },
  {
    path: "/api/admin/vehicleOwnerships",
    handler: require("./VehicleOwnership.routes"),
  },
  { path: "/api/vehicleStatus", handler: require("./VehicleStatus.routes") },
  { path: "/api/admin/statuses", handler: require("./Status.routes") },
  { path: "/api/admin/roles", handler: require("./Role.routes") },
  {
    path: "/api/admin/cancellationReasons",
    handler: require("./CancellationReasonsType.routes"),
  },
  {
    path: "/api/admin/journeyStatus",
    handler: require("./JourneyStatus.routes"),
  },
  {
    path: "/api/admin/delinquencyTypes",
    handler: require("./DelinquencyTypes.routes"),
  },
  { path: "/api/admin/bannedUsers", handler: require("./BannedUsers.routes") },
  {
    path: "/api/admin/userDelinquency",
    handler: require("./UserDelinquency.routes"),
  },
  {
    path: "/api/admin/userDelinquencyDecisions",
    handler: require("./AdminDecisionOnUserDelinquency.routes"),
  },
  // ── Multi-prefix routes (kept with absolute paths + bare mount) ──
  require("./JourneyDecisions.routes"),
  require("./Journey.routes"),
  require("./CanceledJourneys.routes"),
  require("./Database.routes"),
  require("./AttachedDocuments.routes"),
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
      return require("./ShipperRequest.routes");
    } catch (error) {
      console.error("ERROR LOADING ShipperRequest.routes:", error.message);
      console.error(error.stack);
      throw error;
    }
  })(),
  require("./Vehicle.routes"),
  require("./Firebase.routes"),
  require("./Health.routes"),
  require("./SMSSender.routes"),
  require("./User.routes"),
  require("./Admin.routes"),
  {
    path: "/api/user/delinquencyResponse",
    handler: require("./UserDelinquencyResponse.routes"),
  },
  require("./Account.routes"),
  // Modular Company Routes
  { path: "/api/company", handler: require("./company") },
  { path: "/", handler: require("./auth") },
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
