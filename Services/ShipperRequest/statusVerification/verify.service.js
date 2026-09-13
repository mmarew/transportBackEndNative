"use strict";

const {
  getData,
  checkActiveShipperRequest,
} = require("../../../CRUD/Read/ReadData");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const AppError = require("../../../Utils/AppError");

/**
 * Gets the shipper's current journey status
 * @param {string} userUniqueId - Shipper's unique identifier
 * @returns {Promise<number|null>} Journey status ID or null
 */
const getShipperJourneyStatus = async (userUniqueId) => {
  try {
    const [currentRequest] = await getData({
      tableName: "ShipperRequest",
      conditions: { userUniqueId },
      limit: 1,
      orderBy: "shipperRequestId",
      orderDirection: "desc",
    });

    const journeyStatusId = currentRequest?.journeyStatusId;
    return journeyStatusId && journeyStatusId <= journeyStatusMap.journeyStarted
      ? journeyStatusId
      : null;
  } catch (error) {
    const logger = require("../../../Utils/logger");
    logger.error("Error getting current journey status", {
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
};

/**
 * Verifies shipper status and finds drivers if needed
 * This is the main function that handles shipper request status verification
 * and driver matching/notifications
 * @param {Object} params - Verification parameters
 * @param {string} params.userUniqueId - Shipper's unique identifier
 * @param {Array} params.activeRequest - Pre-fetched active requests (optional)
 * @param {Object} params.totalRecords - Pre-calculated total records (optional)
 * @param {boolean} params.sendNotificationsToDrivers - Whether to send notifications to drivers
 * @param {number} params.pageSize - Page size for pagination
 * @param {number} params.page - Page number for pagination
 * @returns {Promise<Object>} Shipper status with drivers, decisions, and journey data
 */
const verifyShipperStatus = async ({
  userUniqueId,
  activeRequest,
  totalRecords,
  pageSize,
  page,
  queueOrganizationUniqueId,
}) => {
  try {
    // 1. Check if the user has an active request (status 1, 2, 3, 4, 5, 6)
    if (!activeRequest || activeRequest?.length === 0) {
      const dataOfActiveRequest = await checkActiveShipperRequest({
        userUniqueId,
        pageSize,
        page,
        queueOrganizationUniqueId,
      });

      activeRequest = dataOfActiveRequest?.activeRequests;
      totalRecords = dataOfActiveRequest?.totalRecords;
    }

    // If no active request, return with totalRecords format
    if (activeRequest?.length === 0 || !activeRequest) {
      // Ensure totalRecords is available (should be set by checkActiveShipperRequest)
      const defaultTotalRecords = {
        totalCount: 0,
        waitingCount: 0,
        requestedCount: 0,
        biddingCount: 0,
        acceptedByShipperCount: 0,
        journeyStartedCount: 0,
        notSeenCompletedCount: 0,
        notSeenCancelledByDriverCount: 0,
      };

      return {
        message: "Shipper request status verified",
        data: {
          totalRecords: totalRecords || defaultTotalRecords,
        },
      };
    }

    // const decisions = [],
    //   drivers = [],
    //   driversData = []; // Shared between handleWaitingRequest and handleNonWaitingRequest

    // let driverFound = false; // track if driver is found to re get active shipper request because no of waiting can be changed to requested
    // const notifiedDrivers = new Set(); // Track drivers who have already been notified to prevent duplicates
    // const notifiedShippersForAcceptance = new Set(); // Track shipper-driver combinations for acceptance notifications

    // // Shipper may have many requests so we loop through them
    // for (const shipperRequest of activeRequest) {
    //   const journeyStatusId = shipperRequest?.journeyStatusId,
    //     shipperRequestId = shipperRequest?.shipperRequestId;

    //   // If journeyStatusId is 1 (Waiting), find nearby drivers and send to them requests
    //   if (journeyStatusId === journeyStatusMap?.waiting) {
    //     const found = await handleWaitingRequest({
    //       shipperRequest,
    //       shipperRequestId,
    //       totalRecords,
    //       pageSize,
    //       page,
    //       driversData,
    //       drivers,
    //       decisions,
    //       notifiedDrivers,
    //     });
    //     if (found) driverFound = true;
    //   }
    //   // If journeyStatusId is not 1, return current data of shipper, driver, journey, and decisions
    //   else {
    //     await handleNonWaitingRequest({
    //       shipperRequest,
    //       totalRecords,
    //       pageSize,
    //       page,
    //       driversData,
    //       decisions,
    //       notifiedDrivers,
    //       notifiedShippersForAcceptance,
    //       sendNotificationsToDrivers,
    //       sendNotificationsToShipper,
    //     });
    //   }
    // }

    // // If driverFound re get active shipper request because no of waiting can be changed to requested
    // if (driverFound) {
    //   const dataOfActiveRequest = await checkActiveShipperRequest({
    //     userUniqueId,
    //     pageSize,
    //     page,
    //   });
    //   activeRequest = dataOfActiveRequest?.activeRequests;
    //   totalRecords = dataOfActiveRequest?.totalRecords;
    // }

    // Final return after loop: only summary
    return {
      message: "Shipper request status verified",
      data: {
        totalRecords,
      },
      pagination: {
        currentPage: page,
        limit: pageSize,
      },
    };
  } catch (error) {
    const logger = require("../../../Utils/logger");
    logger.error("Unable to verify shipper status", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      "Unable to verify shipper status",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports.getShipperJourneyStatus = getShipperJourneyStatus;
module.exports.verifyShipperStatus = verifyShipperStatus;
