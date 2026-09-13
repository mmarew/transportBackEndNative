"use strict";

const { getData } = require("../../../CRUD/Read/ReadData");
const { DOMAIN } = require("../../../Utils/Constants");
const { currentDate } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const logger = require("../../../Utils/logger");
const {
  getJourneyDecisionByJourneyDecisionUniqueId,
} = require("../../JourneyDecisions.service");
const { createJourneyRoutePoint } = require("../../JourneyRoutePoints.service");
const { fetchJourneyNotificationData } = require("../helpers");

const sendUpdatedLocation = async (body) => {
  try {
    const { journeyDecisionUniqueId, latitude, longitude, userUniqueId } = body;

    // Validate required fields
    if (!journeyDecisionUniqueId) {
      throw new AppError(
        "journeyDecisionUniqueId is required",
        AppError.BAD_REQUEST,
      );
    }

    if (latitude === undefined || latitude === null) {
      throw new AppError("latitude is required", AppError.BAD_REQUEST);
    }

    if (longitude === undefined || longitude === null) {
      throw new AppError("longitude is required", AppError.BAD_REQUEST);
    }

    if (userUniqueId === undefined || userUniqueId === null) {
      throw new AppError("userUniqueId is required", AppError.BAD_REQUEST);
    }

    // Validate coordinate ranges
    if (latitude < DOMAIN.LATITUDE_MIN || latitude > DOMAIN.LATITUDE_MAX) {
      throw new AppError(
        "Invalid latitude. Must be between -90 and 90",
        AppError.BAD_REQUEST,
      );
    }

    if (longitude < DOMAIN.LONGITUDE_MIN || longitude > DOMAIN.LONGITUDE_MAX) {
      throw new AppError(
        "Invalid longitude. Must be between -180 and 180",
        AppError.BAD_REQUEST,
      );
    }

    // Fetch journey decision to validate driver owns this journey
    const journeyDecision = await getJourneyDecisionByJourneyDecisionUniqueId(
      journeyDecisionUniqueId,
    );

    if (!journeyDecision?.data || journeyDecision.data.length === 0) {
      throw new AppError("Journey decision not found", AppError.NOT_FOUND);
    }

    const journeyDecisionData = journeyDecision.data[0];
    const driverRequestId = journeyDecisionData.driverRequestId;

    // Validate driver owns this journey request
    const driverRequest = await getData({
      tableName: "DriverRequest",
      conditions: {
        driverRequestId,
        userUniqueId, // Ensure driver owns this request
      },
      limit: 1,
    });

    if (!driverRequest || driverRequest.length === 0) {
      throw new AppError(
        "Driver request not found or you don't have permission to update location for this journey",
        AppError.FORBIDDEN,
      );
    }

    // Validate journey status - location updates should only be sent for active journeys
    const journeyStatusId = driverRequest[0].journeyStatusId;
    const activeStatuses = [
      journeyStatusMap.acceptedByDriver,
      journeyStatusMap.acceptedByShipper,
      journeyStatusMap.goToLoadingPlace,
      journeyStatusMap.loading,
      journeyStatusMap.loaded,
      journeyStatusMap.journeyStarted,
    ];

    if (!activeStatuses.includes(journeyStatusId)) {
      throw new AppError(
        "Location updates can only be sent for active journeys (accepted, loading, or started)",
        AppError.BAD_REQUEST,
      );
    }

    // Fetch shipper phone number from journey data if not provided
    let shipperPhoneNumber = body.shipperPhone;
    if (!shipperPhoneNumber) {
      // Pass already-fetched journeyDecision and driverRequest to avoid re-fetching
      const notificationData = await fetchJourneyNotificationData(
        journeyDecisionUniqueId,
        driverRequest, // Already fetched above
        null, // No vehicle data available
        journeyDecision, // Already fetched above - pass to avoid re-fetching
      );

      if (
        notificationData.message === "error" ||
        !notificationData.shipperRequest
      ) {
        throw new AppError(
          "Unable to fetch shipper information for location update",
          AppError.NOT_FOUND,
        );
      }

      shipperPhoneNumber = notificationData.shipperRequest?.phoneNumber || null;

      if (!shipperPhoneNumber) {
        throw new AppError(
          "Shipper phone number not found",
          AppError.NOT_FOUND,
        );
      }
    }

    // Store location in JourneyRoutePoints table for historical tracking and real-time notification
    // Single table insert - no transaction needed (atomic operation)
    // createJourneyRoutePoint handles storing location and sending notification to shipper
    // Note: createJourneyRoutePoint is already imported at the top of the file
    const routePointResult = await createJourneyRoutePoint({
      journeyDecisionUniqueId,
      latitude,
      longitude,
      userUniqueId,
      shipperPhoneNumber, // Pass for notification (createJourneyRoutePoint sends notification)
      ...(body.additionalData || {}), // Include any additional data for notification
    });

    // If route point creation failed, return error
    if (!routePointResult.success) {
      throw new AppError(
        routePointResult.message || "Failed to store location",
        AppError.BAD_REQUEST,
      );
    }

    // Note: createJourneyRoutePoint already sends WebSocket notification to shipper
    // with messageType: update_drivers_location_to_shipper
    // No need to send duplicate notification here

    return {
      message: "Location updated successfully",
      data: null,
      journeyRoutePointsUniqueId:
        routePointResult.data?.journeyRoutePointsUniqueId,
      latitude,
      longitude,
      timestamp: currentDate(),
      journeyDecisionUniqueId,
    };
  } catch (error) {
    logger.error("@sendUpdatedLocation error:", error);
    throw new AppError(
      error.message || "Unable to send updated location",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports = { sendUpdatedLocation };
