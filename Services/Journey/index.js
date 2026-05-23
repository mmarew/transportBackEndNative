"use strict";

const journeyCreate = require("./journeyCreate.service");
const journeyRead = require("./journeyRead.service");
const journeyUpdate = require("./journeyUpdate.service");
const journeyDelete = require("./journeyDelete.service");
const journeyHelper = require("./journeyHelper");

module.exports = {
  createJourney: journeyCreate.createJourney,
  getAllJourneys: journeyRead.getAllJourneys,
  getJourneyByJourneyUniqueId: journeyRead.getJourneyByJourneyUniqueId,
  updateJourney: journeyUpdate.updateJourney,
  deleteJourney: journeyDelete.deleteJourney,
  getCompletedJourneyCountsByDate: journeyRead.getCompletedJourneyCountsByDate,
  searchCompletedJourneyByUserData: journeyRead.searchCompletedJourneyByUserData,
  getOngoingJourney: journeyRead.getOngoingJourney,
  getAllCompletedJourneys: journeyRead.getAllCompletedJourneys,
  getJourneys: journeyRead.getJourneys,
  getDriverRequestByRequestId: journeyHelper.getDriverRequestByRequestId,
  getShipperRequestByShipperRequestId: journeyHelper.getShipperRequestByShipperRequestId};