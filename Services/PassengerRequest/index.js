/**
 * PassengerRequest Service Module
 *
 * This module exports all shipper request-related services organized by functionality:
 * - requestCRUD: Create, Read, Update, Delete operations
 * - requestActions: Business logic actions (accept, reject, cancel)
 * - statusVerification: Status checking and driver matching
 * - cancellation: Cancellation notifications management
 */

const requestCRUD = require("./requestCRUD.service");
const requestActions = require("./requestActions.service");
const statusVerification = require("./statusVerification.service");
const cancellation = require("./cancellation.service");

module.exports = {
  // CRUD Operations
  createPassengerRequest: requestCRUD.createPassengerRequest,
  getPassengerRequestByPassengerRequestId:
    requestCRUD.getPassengerRequestByPassengerRequestId,
  getPassengerRequestByUniqueId: requestCRUD.getPassengerRequestByUniqueId,
  getPassengerRequest4allOrSingleUser:
    requestCRUD.getPassengerRequest4allOrSingleUser,
  getDetailedJourneyData: requestCRUD.getDetailedJourneyData,
  updateRequestById: requestCRUD.updateRequestById,
  deleteRequest: requestCRUD.deleteRequest,
  getAllActiveRequests: requestCRUD.getAllActiveRequests,

  // Request Actions
  acceptDriverRequest: requestActions.acceptDriverRequest,
  rejectDriverOffer: requestActions.rejectDriverOffer,
  cancelPassengerRequest: requestActions.cancelPassengerRequest,

  // Status Verification
  verifyPassengerStatus: statusVerification.verifyPassengerStatus,
  getPassengerJourneyStatus: statusVerification.getPassengerJourneyStatus,
  seenByPassenger: statusVerification.seenByPassenger,

  // Cancellation
  getCancellationNotifications: cancellation.getCancellationNotifications,
  markCancellationAsSeen: cancellation.markCancellationAsSeen,
};
