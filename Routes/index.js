const Routes = require("express").Router();
const { RATINGS_ENDPOINTS } = require("./EndPoints/ratings.endpoints.js");
const {
  DOCUMENT_TYPES_ENDPOINTS,
} = require("./EndPoints/documentTypes.endpoints.js");
const { USER_ROLE_ENDPOINTS } = require("./EndPoints/userRole.endpoints.js");
const {
  VEHICLE_TYPE_ENDPOINTS,
} = require("./EndPoints/vehicleType.endpoints.js");
const {
  VEHICLE_DRIVER_ENDPOINTS,
} = require("./EndPoints/vehicleDriver.endpoints.js");
const {
  VEHICLE_STATUS_ENDPOINTS,
} = require("./EndPoints/vehicleStatus.endpoints.js");
const { STATUS_ENDPOINTS } = require("./EndPoints/status.endpoints.js");
const { ROLE_ENDPOINTS } = require("./EndPoints/role.endpoints.js");
const {
  BANNED_USERS_ENDPOINTS,
} = require("./EndPoints/bannedUsers.endpoints.js");

const routesArray = [
  { path: "/api/finance", handler: require("./finance") }, // All financial routes consolidated
  // ── Single-prefix routes (industry-standard: mounted with base prefix) ──
  {
    path: "/api/admin/tariffRateForVehicleType",
    handler: require("./TariffRateForVehicleTypes.routes"),
  },
  { path: RATINGS_ENDPOINTS.MOUNT, handler: require("./Ratings.routes") },
  {
    path: "/api/deliveryConfirmations",
    handler: require("./DeliveryConfirmation.routes"),
  },
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
  {
    path: DOCUMENT_TYPES_ENDPOINTS.MOUNT,
    handler: require("./DocumentTypes.routes"),
  },
  {
    path: "/api/admin/userRoleStatus",
    handler: require("./UserRoleStatus.routes"),
  },
  { path: USER_ROLE_ENDPOINTS.MOUNT, handler: require("./UserRole.routes") },
  {
    path: VEHICLE_TYPE_ENDPOINTS.MOUNT,
    handler: require("./VehicleType.routes"),
  },
  {
    path: VEHICLE_DRIVER_ENDPOINTS.MOUNT,
    handler: require("./VehicleDriver.routes"),
  },
  {
    path: "/api/admin/vehicleOwnerships",
    handler: require("./VehicleOwnership.routes"),
  },
  {
    path: VEHICLE_STATUS_ENDPOINTS.MOUNT,
    handler: require("./VehicleStatus.routes"),
  },
  { path: STATUS_ENDPOINTS.MOUNT, handler: require("./Status.routes") },
  { path: ROLE_ENDPOINTS.MOUNT, handler: require("./Role.routes") },
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
  {
    path: BANNED_USERS_ENDPOINTS.MOUNT,
    handler: require("./BannedUsers.routes"),
  },
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
  // Modular Queue Dispatch Routes
  {
    path: "/api/queueOrganization",
    handler: require("./queue").queueOrganizationRoutes,
  },
  { path: "/api/queue", handler: require("./queue").driverQueueRoutes },
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
