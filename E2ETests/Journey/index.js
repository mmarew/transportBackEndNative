// Journey E2E Tests Export
// Central export for all journey-related tests

const { testJourneyStatusWorkflow, testGetJourneyStatuses } = require("./JourneyStatus");
const { testCancellationReasonsTypeWorkflow, testGetCancellationReasonTypes } = require("./CancellationReasonsType");
const { testCanceledJourneysWorkflow, testGetCanceledJourneys } = require("./CanceledJourneys");
const { testJourneyRoutePointsWorkflow, testGetJourneyRoutePoints } = require("./JourneyRoutePoints");
const { testJourneyWorkflow, testGetJourneys, testGetOngoingJourney, testGetCompletedJourneys } = require("./Journey");

module.exports = {
  // Journey Status
  testJourneyStatusWorkflow,
  testGetJourneyStatuses,
  // Cancellation Reasons
  testCancellationReasonsTypeWorkflow,
  testGetCancellationReasonTypes,
  // Canceled Journeys
  testCanceledJourneysWorkflow,
  testGetCanceledJourneys,
  // Journey Route Points
  testJourneyRoutePointsWorkflow,
  testGetJourneyRoutePoints,
  // Journey CRUD
  testJourneyWorkflow,
  testGetJourneys,
  testGetOngoingJourney,
  testGetCompletedJourneys,
};
