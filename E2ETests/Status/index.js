// Status E2E Tests Export

const { testStatusWorkflow, testGetStatuses } = require("./Status");
const { testUserRoleStatusWorkflow, testGetUserRoleStatusCurrent } = require("./UserRoleStatus");

// Re-export UserStatus from Roles folder (already exists there)
const { testUserStatusWorkflow } = require("../Roles/UserStatus");

const {
  testMarkAsSeenWorkflow,
  testMarkNegativeStatusAsSeen,
  testMarkJourneyCompletionAsSeen,
  testMarkCancellationAsSeen,
  testGetDriverCancellationNotifications,
  testGetShipperCancellationNotifications,
} = require("./MarkAsSeen");

const {
  testCreateUserStatus,
  runStatusSupplementaryTests,
} = require("./StatusSupplementary");

module.exports = {
  testStatusWorkflow,
  testGetStatuses,
  testUserRoleStatusWorkflow,
  testGetUserRoleStatusCurrent,
  testUserStatusWorkflow,
  testMarkAsSeenWorkflow,
  testMarkNegativeStatusAsSeen,
  testMarkJourneyCompletionAsSeen,
  testMarkCancellationAsSeen,
  testGetDriverCancellationNotifications,
  testGetShipperCancellationNotifications,
  testCreateUserStatus,
  runStatusSupplementaryTests,
};
