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

const isTerminalStatus = journeyStatusId => {
  return journeyStatusId > journeyStatusMap.journeyCompleted;
};

// verifyDriverJourneyStatus starts here

module.exports = {
  getNotificationStatuses,
  shouldHandleNotificationStatus,
  isTerminalStatus
};
