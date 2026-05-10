/**
 * ShipperRequest Service Module
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
  createShipperRequest: requestCRUD.createShipperRequest,
  getShipperRequestByShipperRequestId:
    requestCRUD.getShipperRequestByShipperRequestId,
  getShipperRequestByUniqueId: requestCRUD.getShipperRequestByUniqueId,
  getShipperRequest4allOrSingleUser:
    requestCRUD.getShipperRequest4allOrSingleUser,
  getDetailedJourneyData: requestCRUD.getDetailedJourneyData,
  updateRequestById: requestCRUD.updateRequestById,
  deleteRequest: requestCRUD.deleteRequest,
  getAllActiveRequests: requestCRUD.getAllActiveRequests,

  // Request Actions
  acceptDriverRequest: requestActions.acceptDriverRequest,
  rejectDriverOffer: requestActions.rejectDriverOffer,
  cancelShipperRequest: requestActions.cancelShipperRequest,

  // Status Verification
  verifyShipperStatus: statusVerification.verifyShipperStatus,
  getShipperJourneyStatus: statusVerification.getShipperJourneyStatus,
  seenByShipper: statusVerification.seenByShipper,

  // Cancellation
  getCancellationNotifications: cancellation.getCancellationNotifications,
  markCancellationAsSeen: cancellation.markCancellationAsSeen,
};
