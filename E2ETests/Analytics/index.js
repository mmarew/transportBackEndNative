// Analytics & System Admin Tests Export

const {
  testAnalyticsWorkflow,
  testGetCanceledJourneyCountsByDate,
  testGetCanceledJourneyCountsByReason,
  testGetCanceledJourneyByFilter,
  testGetUserByFilterDetailed,
  testGetOnlineDrivers,
  testGetOfflineDrivers,
  testGetAllActiveDrivers,
} = require("./Analytics");

const {
  testSystemAdminWorkflow,
  testHealthCheck,
  testDatabaseHealthCheck,
  testDatabaseStats,
  testGetSystemLogs,
  testGetSystemUploads,
} = require("./SystemAdmin");

module.exports = {
  testAnalyticsWorkflow,
  testGetCanceledJourneyCountsByDate,
  testGetCanceledJourneyCountsByReason,
  testGetCanceledJourneyByFilter,
  testGetUserByFilterDetailed,
  testGetOnlineDrivers,
  testGetOfflineDrivers,
  testGetAllActiveDrivers,
  testSystemAdminWorkflow,
  testHealthCheck,
  testDatabaseHealthCheck,
  testDatabaseStats,
  testGetSystemLogs,
  testGetSystemUploads,
};
