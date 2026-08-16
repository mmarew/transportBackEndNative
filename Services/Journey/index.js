"use strict";

const journeyCreate = require("./journeyCreate.service");
const promoteAcceptedJourney = require("./promoteAcceptedJourney.service");
const journeyRead = require("./journeyRead");
const journeyUpdate = require("./journeyUpdate.service");
const journeyDelete = require("./journeyDelete.service");
const journeyHelper = require("./journeyHelper");

module.exports = {
  createJourney: journeyCreate.createJourney,
  promoteToAcceptedByShipperAndCreateJourney:
    promoteAcceptedJourney.promoteToAcceptedByShipperAndCreateJourney,
  getAllJourneys: journeyRead.getAllJourneys,
  getJourneyByJourneyUniqueId: journeyRead.getJourneyByJourneyUniqueId,
  updateJourney: journeyUpdate.updateJourney,
  deleteJourney: journeyDelete.deleteJourney,
  getCompletedJourneyCountsByDate:
    journeyHelper.getCompletedJourneyCountsByDate,
  searchCompletedJourneyByUserData:
    journeyRead.searchCompletedJourneyByUserData,
  getOngoingJourney: journeyRead.getOngoingJourney,
  getAllCompletedJourneys: journeyRead.getAllCompletedJourneys,
  getJourneys: journeyRead.getJourneys,
  getJourneysWithPodStatus: journeyRead.getJourneysWithPodStatus,
  getDriverRequestByRequestId: journeyHelper.getDriverRequestByRequestId,
  getShipperRequestByShipperRequestId:
    journeyHelper.getShipperRequestByShipperRequestId,
};
