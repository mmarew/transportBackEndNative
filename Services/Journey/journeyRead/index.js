"use strict";

const getJourneys = require("./getJourneys.service");
const getAllCompletedJourneys = require("./getAllCompletedJourneys.service");
const getOngoingJourney = require("./getOngoingJourney.service");
const searchCompletedJourney = require("./searchCompletedJourney.service");
const helpers = require("./helpers.service");

module.exports = {
  ...getJourneys,
  ...getAllCompletedJourneys,
  ...getOngoingJourney,
  ...searchCompletedJourney,
  ...helpers
};
