"use strict";



const {
  pool
} = require("../../../Middleware/Database.config");
const {
  journeyStatusMap,
  
} = require("../../../Utils/ListOfSeedData");




// Removed unused import: VerifyIfShipperRequestWasNotRejected
// Removed unused import: VerifyIfShipperRequestWasNotRejected


// Removed unused import: executeInTransaction
// Import helpers from helpers.js
// Removed unused import: executeInTransaction
// Import helpers from helpers.js


const getNotificationStatuses = () => [journeyStatusMap.notSelectedInBid, journeyStatusMap.cancelledByShipper, journeyStatusMap.cancelledByAdmin, journeyStatusMap.rejectedByShipper];

const shouldHandleNotificationStatus = (journeyStatusId, notificationStatuses) => {
  return notificationStatuses.includes(journeyStatusId);
};

// Loading stages (5/6/7) sit below journeyCompleted (9), so they are naturally
// NOT terminal — no special-casing needed after the status renumber.
const isTerminalStatus = journeyStatusId => {
  return journeyStatusId > journeyStatusMap.journeyCompleted;
};

// verifyDriverJourneyStatus starts here

module.exports = {
  getNotificationStatuses,
  shouldHandleNotificationStatus,
  isTerminalStatus
};
