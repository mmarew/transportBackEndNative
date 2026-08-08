// Status E2E Tests Export

const { testStatusWorkflow, testGetStatuses } = require("./Status");
const { testUserRoleStatusWorkflow, testGetUserRoleStatusCurrent } = require("./UserRoleStatus");

const {
  testMarkAsSeenWorkflow,
  testMarkNegativeStatusAsSeen,
  testMarkJourneyCompletionAsSeen,
  testMarkCancellationAsSeen,
  testGetDriverCancellationNotifications,
  testGetShipperCancellationNotifications,
} = require("./MarkAsSeen");

module.exports = {
  testStatusWorkflow,
  testGetStatuses,
  testUserRoleStatusWorkflow,
  testGetUserRoleStatusCurrent,
  testMarkAsSeenWorkflow,
  testMarkNegativeStatusAsSeen,
  testMarkJourneyCompletionAsSeen,
  testMarkCancellationAsSeen,
  testGetDriverCancellationNotifications,
  testGetShipperCancellationNotifications,
};
