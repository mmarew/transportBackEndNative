const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'Routes');
const utilsDir = path.join(routesDir, 'utils');

const filesToRefactor = [
  "BannedUsers.routes.js",
  "CanceledJourneys.routes.js",
  "CancellationReasonsType.routes.js",
  "Database.routes.js",
  "DelinquencyTypes.routes.js",
  "DocumentTypes.routes.js",
  "DriverRequest.routes.js",
  "Firebase.routes.js",
  "Health.routes.js",
  "Journey.routes.js",
  "JourneyDecisions.routes.js",
  "JourneyRoutePoints.routes.js",
  "JourneyStatus.routes.js",
  "Ratings.routes.js",
  "Role.routes.js"
];

// Helper to generate the exact variable names used in the created utils files
const generateConstantName = (routePath, method) => {
  let name = routePath.replace(/^\/api\/(admin|user|company|vehicle|driver|shipper|dispatcher|me)\//, '');
  name = name.replace(/^\/api\//, '');
  name = name.replace(/^\//, '');
  name = name.replace(/\/:[a-zA-Z0-9_]+/g, '');
  name = name.replace(/[\/\-]/g, '_');
  name = name.replace(/[A-Z]/g, letter => `_${letter}`);
  name = name.toUpperCase();
  
  if (method) {
    name = `${method.toUpperCase()}_${name}`;
  }
  
  name = name.replace(/__+/g, '_');
  name = name.replace(/^_/, '');
  name = name.replace(/_$/, '');
  
  if (!name) name = "BASE_ROUTE";
  return name;
};

// Manually created mapping based on our `write_to_file` calls
// So the script knows exactly what variables to replace with
const utilMap = {
  "BannedUsers.routes.js": {
    endpoints: {
      "BAN_USER": "/api/admin/banned-users",
      "GET_BANNED_USERS": "/api/admin/banned-users",
      "UPDATE_BANNED_USER": "/api/admin/banned-users/:banUniqueId",
      "UNBAN_USER": "/api/admin/banned-users",
      "DEACTIVATE_BAN": "/api/admin/banned-users/:banUniqueId/deactivate"
    },
    varName: "BANNED_USERS_ENDPOINTS",
    utilFile: "bannedUsers.utils.js"
  },
  "CanceledJourneys.routes.js": {
    endpoints: {
      "CREATE_CANCELED_JOURNEY": "/api/admin/canceledJourney",
      "CANCEL_JOURNEY_BY_SYSTEM": "/api/admin/canceledJourneyBySystem",
      "GET_CANCELED_JOURNEY_BY_FILTER": "/api/admin/getCanceledJourneyByFilter",
      "GET_CANCELED_JOURNEY_COUNTS_BY_DATE": "/api/user/getCanceledJourneyCountsByDate",
      "UPDATE_CANCELED_JOURNEY": "/api/admin/canceledJourney/:canceledJourneyUniqueId",
      "DELETE_CANCELED_JOURNEY": "/api/admin/canceledJourney/:canceledJourneyUniqueId",
      "UPDATE_SEEN_BY_ADMIN": "/api/admin/canceledJourney/:canceledJourneyUniqueId/seen",
      "GET_CANCELED_JOURNEY_COUNTS_BY_REASON": "/api/user/getCanceledJourneyCountsByReason"
    },
    varName: "CANCELED_JOURNEYS_ENDPOINTS",
    utilFile: "canceledJourneys.utils.js"
  },
  "CancellationReasonsType.routes.js": {
    endpoints: {
      "ADD_CANCELLATION_REASONS": "/api/admin/cancellationReasons",
      "GET_ALL_CANCELLATION_REASONS": "/api/admin/cancellationReasons",
      "UPDATE_CANCELLATION_REASONS": "/api/admin/cancellationReasons/:cancellationReasonTypeUniqueId",
      "DELETE_CANCELLATION_REASONS": "/api/admin/cancellationReasons/:cancellationReasonTypeUniqueId"
    },
    varName: "CANCELLATION_REASONS_TYPE_ENDPOINTS",
    utilFile: "cancellationReasonsType.utils.js"
  },
  "Database.routes.js": {
    endpoints: {
      "CREATE_TABLE": "/api/admin/createTable",
      "GET_ALL_TABLES": "/api/admin/tables",
      "DROP_TABLES": "/api/admin/dropTables",
      "DROP_ALL_TABLES": "/api/admin/dropAllTables",
      "UPDATE_TABLE": "/api/admin/updateTable/:tableName",
      "ALTER_COLUMN": "/api/admin/alterColumn/:tableName",
      "DROP_COLUMN": "/api/admin/dropColumn/:tableName/:columnName",
      "GET_TABLE_COLUMNS": "/tableColumns/:tableName",
      "GET_INSTALL_PREDEFINED_DATA": "/api/admin/installPreDefinedData",
      "POST_INSTALL_PREDEFINED_DATA": "/api/admin/installPreDefinedData",
      "GET_USER_OTP": "/api/admin/dev/getUserOtp",
      "SEED_TEST_DOCUMENT": "/api/admin/dev/seedTestDocument"
    },
    varName: "DATABASE_ENDPOINTS",
    utilFile: "database.utils.js"
  },
  "DelinquencyTypes.routes.js": {
    endpoints: {
      "CREATE_DELINQUENCY_TYPE": "/api/admin/delinquency-types",
      "GET_DELINQUENCY_TYPES": "/api/admin/delinquency-types",
      "UPDATE_DELINQUENCY_TYPE": "/api/admin/delinquency-types/:delinquencyTypeUniqueId",
      "DELETE_DELINQUENCY_TYPE": "/api/admin/delinquency-types/:delinquencyTypeUniqueId",
      "GET_DELINQUENCY_TYPES_BY_ROLE": "/api/admin/delinquency-types/role/:roleUniqueId",
      "TOGGLE_DELINQUENCY_TYPE_ACTIVE": "/api/admin/delinquency-types/:delinquencyTypeUniqueId/toggle-active"
    },
    varName: "DELINQUENCY_TYPES_ENDPOINTS",
    utilFile: "delinquencyTypes.utils.js"
  },
  "DocumentTypes.routes.js": {
    endpoints: {
      "CREATE_DOCUMENT_TYPE": "/api/documentTypes",
      "GET_DOCUMENT_TYPES": "/api/documentTypes",
      "UPDATE_DOCUMENT_TYPE": "/api/documentTypes/:documentTypeUniqueId",
      "DELETE_DOCUMENT_TYPE": "/api/documentTypes/:documentTypeUniqueId"
    },
    varName: "DOCUMENT_TYPES_ENDPOINTS",
    utilFile: "documentTypes.utils.js"
  },
  "DriverRequest.routes.js": {
    endpoints: {
      "TAKE_FROM_STREET": "/api/driver/takeFromStreet",
      "DRIVER_REQUEST": "/api/driver/request",
      "CREATE_AND_ACCEPT_NEW_REQUEST": "/api/driver/createAndAcceptNewRequest",
      "ACCEPT_SHIPPER_REQUEST": "/api/driver/acceptShipperRequest",
      "START_JOURNEY": "/api/driver/startJourney",
      "NO_ANSWER_FROM_DRIVER": "/api/shipper/noAnswerFromDriver",
      "CANCEL_DRIVER_REQUEST": "/api/driver/cancelDriverRequest",
      "COMPLETE_JOURNEY": "/api/driver/completeJourney",
      "UPDATE_DRIVER_REQUEST": "/api/driver/request/:driverRequestUniqueId",
      "DELETE_DRIVER_REQUEST": "/api/driver/request/:driverRequestUniqueId",
      "VERIFY_DRIVER_JOURNEY_STATUS": "/api/driver/verifyDriverJourneyStatus",
      "GET_DRIVER_REQUEST": "/api/user/getDriverRequest",
      "SEND_UPDATED_LOCATION": "/api/driver/sendUpdatedLocation",
      "GET_CANCELLATION_NOTIFICATIONS": "/api/driver/getCancellationNotifications",
      "MARK_NEGATIVE_STATUS_AS_SEEN": "/api/driver/markNegativeStatusAsSeen"
    },
    varName: "DRIVER_REQUEST_ENDPOINTS",
    utilFile: "driverRequest.utils.js"
  },
  "Firebase.routes.js": {
    endpoints: {
      "UPSERT_FCM_TOKEN": "/api/user/upsertFCMToken",
      "GET_FCM_TOKEN": "/api/user/getFCMToken/:deviceTokenUniqueId",
      "UPDATE_FCM_TOKEN": "/api/user/updateFCMToken/:deviceTokenUniqueId",
      "DELETE_FCM_TOKEN": "/api/user/deleteFCMToken/:deviceTokenUniqueId",
      "SEND_TO_USER": "/api/notifications/send-to-user",
      "SEND_TO_TOKENS": "/api/notifications/send-to-tokens"
    },
    varName: "FIREBASE_ENDPOINTS",
    utilFile: "firebase.utils.js"
  },
  "Health.routes.js": {
    endpoints: {
      "HEALTH_CHECK": "/api/health",
      "DATABASE_HEALTH": "/api/health/database",
      "DATABASE_STATS": "/api/admin/database/stats"
    },
    varName: "HEALTH_ENDPOINTS",
    utilFile: "health.utils.js"
  },
  "Journey.routes.js": {
    endpoints: {
      "CREATE_JOURNEY": "/api/journey",
      "GET_JOURNEY_BY_ID": "/api/journey/:journeyUniqueId",
      "UPDATE_JOURNEY": "/api/journey/:journeyUniqueId",
      "DELETE_JOURNEY": "/api/journey/:journeyUniqueId",
      "GET_COMPLETED_JOURNEY_COUNTS_BY_DATE": "/api/user/getCompletedJourneyCountsByDate",
      "SEARCH_COMPLETED_JOURNEY_BY_USER_DATA": "/api/user/searchCompletedJourneyByUserData",
      "GET_ALL_COMPLETED_JOURNEY": "/api/driver/getAllCompletedJourney",
      "GET_ONGOING_JOURNEY": "/api/user/getOngoingJourney",
      "GET_JOURNEYS": "/api/journey"
    },
    varName: "JOURNEY_ENDPOINTS",
    utilFile: "journey.utils.js"
  },
  "JourneyDecisions.routes.js": {
    endpoints: {
      "CREATE_JOURNEY_DECISION": "/api/journeyDecisions",
      "GET_JOURNEY_DECISION_4_ALL_OR_SINGLE_USER": "/api/user/getJourneyDecision4AllOrSingleUser",
      "UPDATE_JOURNEY_DECISION": "/api/journeyDecisions",
      "DELETE_JOURNEY_DECISION": "/api/journeyDecisions/:id"
    },
    varName: "JOURNEY_DECISIONS_ENDPOINTS",
    utilFile: "journeyDecisions.utils.js"
  },
  "JourneyRoutePoints.routes.js": {
    endpoints: {
      "CREATE_JOURNEY_ROUTE_POINT": "/api/journeyRoutePoints",
      "GET_JOURNEY_ROUTE_POINTS": "/api/journeyRoutePoints",
      "UPDATE_JOURNEY_ROUTE_POINT": "/api/journeyRoutePoints/:pointId",
      "DELETE_JOURNEY_ROUTE_POINT": "/api/journeyRoutePoints/:pointId"
    },
    varName: "JOURNEY_ROUTE_POINTS_ENDPOINTS",
    utilFile: "journeyRoutePoints.utils.js"
  },
  "JourneyStatus.routes.js": {
    endpoints: {
      "CREATE_JOURNEY_STATUS": "/api/admin/journeyStatus",
      "GET_ALL_JOURNEY_STATUSES": "/api/admin/journeyStatus",
      "UPDATE_JOURNEY_STATUS": "/api/admin/journeyStatus/:journeyStatusUniqueId",
      "DELETE_JOURNEY_STATUS": "/api/admin/journeyStatus/:journeyStatusUniqueId"
    },
    varName: "JOURNEY_STATUS_ENDPOINTS",
    utilFile: "journeyStatus.utils.js"
  },
  "Ratings.routes.js": {
    endpoints: {
      "CREATE_RATING": "/api/ratings",
      "GET_ALL_RATINGS": "/api/ratings",
      "UPDATE_RATING": "/api/ratings/:id",
      "DELETE_RATING": "/api/ratings/:id"
    },
    varName: "RATINGS_ENDPOINTS",
    utilFile: "ratings.utils.js"
  },
  "Role.routes.js": {
    endpoints: {
      "CREATE_ROLE": "/api/admin/roles",
      "UPDATE_ROLE": "/api/admin/roles/:roleUniqueId",
      "DELETE_ROLE": "/api/admin/roles/:roleUniqueId",
      "GET_ALL_ROLES": "/api/admin/roles"
    },
    varName: "ROLE_ENDPOINTS",
    utilFile: "role.utils.js"
  }
};

filesToRefactor.forEach(filename => {
  const filePath = path.join(routesDir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filename}`);
    return;
  }
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Skip if already refactored
  if (content.includes('.utils")') || content.includes(".utils');")) {
    console.log(`Skipping ${filename}, already seems refactored.`);
    return;
  }
  
  const mapInfo = utilMap[filename];
  if (!mapInfo) {
    console.log(`No mapping found for ${filename}`);
    return;
  }
  
  const { endpoints, varName, utilFile } = mapInfo;
  
  // Replace all paths using the endpoints dictionary
  for (const [key, val] of Object.entries(endpoints)) {
    // Replace in router.METHOD("...")
    const regex1 = new RegExp(`(["'])${val}(["'])`, 'g');
    content = content.replace(regex1, `${varName}.${key}`);
  }
  
  // Update original file with import
  const importStatement = `const { ${varName} } = require("./utils/${utilFile}");\n`;
  
  // Add import after the last require statement at the top
  const lastRequireIndex = content.lastIndexOf('require(');
  if (lastRequireIndex !== -1) {
    const endOfLine = content.indexOf('\n', lastRequireIndex);
    content = content.slice(0, endOfLine + 1) + importStatement + content.slice(endOfLine + 1);
  } else {
    content = importStatement + content;
  }
  
  fs.writeFileSync(filePath, content);
  console.log(`✅ Refactored ${filename}`);
});
