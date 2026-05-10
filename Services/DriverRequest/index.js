/**
 * DriverRequest Service Module
 *
 * This module exports all driver request related services organized by functionality:
 * - requestCRUD: Create, Read, Update, Delete operations
 * - requestActions: Business logic actions (accept, cancel, take from street)
 * - journeyManagement: Journey lifecycle management (start, complete, location updates)
 * - statusVerification: Status checking and verification
 * - cancellation: Cancellation notifications management
 * - helpers: Shared utility functions
 *
 * NOTE: This is the split version of the original DriverRequest.service.js (3507 lines).
 * The original file has been temporarily disabled for testing.
 * All exports remain the same for backward compatibility.
 */

const requestCRUD = require("./requestCRUD.service");
const requestActions = require("./requestActions.service");
const journeyManagement = require("./journeyManagement.service");
const statusVerification = require("./statusVerification.service");
const cancellation = require("./cancellation.service");
const helpers = require("./helpers");

module.exports = {
  // CRUD Operations
  createRequest: requestCRUD.createRequest,
  deleteDriverRequest: requestCRUD.deleteDriverRequest,
  getDriverRequest: requestCRUD.getDriverRequest,
  getDriverJourneyStatus: requestCRUD.getDriverJourneyStatus,
  updateDriverRequest: requestCRUD.updateDriverRequest,
  updateDriverRequestByDriver: requestCRUD.updateDriverRequestByDriver,

  // Request Actions
  takeFromStreet: requestActions.takeFromStreet,
  createAndAcceptNewRequest: requestActions.createAndAcceptNewRequest,
  acceptShipperRequest: requestActions.acceptShipperRequest,
  noAnswerFromDriver: requestActions.noAnswerFromDriver,
  cancelDriverRequest: requestActions.cancelDriverRequest,

  // Journey Management
  startJourney: journeyManagement.startJourney,
  completeJourney: journeyManagement.completeJourney,
  sendUpdatedLocation: journeyManagement.sendUpdatedLocation,

  // Status Verification
  verifyDriverJourneyStatus: statusVerification.verifyDriverJourneyStatus,
  handleJourneyStatusOne: statusVerification.handleJourneyStatusOne,
  handleExistingJourney: statusVerification.handleExistingJourney,
  getNotificationStatuses: statusVerification.getNotificationStatuses,
  shouldHandleNotificationStatus:
    statusVerification.shouldHandleNotificationStatus,
  isTerminalStatus: statusVerification.isTerminalStatus,

  // Cancellation
  getCancellationNotifications: cancellation.getCancellationNotifications,
  markNegativeStatusAsSeenByDriver:
    cancellation.markNegativeStatusAsSeenByDriver,

  // Helpers (only export fetchJourneyNotificationData, others are internal)
  fetchJourneyNotificationData: helpers.fetchJourneyNotificationData,
};
