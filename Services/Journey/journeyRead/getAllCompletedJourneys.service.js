"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  transactionStorage
} = require("../../../Utils/TransactionContext");
const AppError = require("../../../Utils/AppError");

const {
  journeyStatusMap,
  
} = require("../../../Utils/ListOfSeedData");



// Get all journeys with pagination

// (removed) searchOngoingJourneyByUserData - functionality merged into getOngoingJourney

// Get all completed journeys with pagination (OPTIMIZED)
const getAllCompletedJourneys = async ({
  page = 1,
  limit = 10
}) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
    const offset = (safePage - 1) * safeLimit;

    // OPTIMIZED: Single query with JOINs instead of N+1 queries
    const dataSql = `
      SELECT 
        -- Journey data
        Journey.journeyId,
        Journey.journeyUniqueId,
        Journey.journeyDecisionUniqueId,
        Journey.startTime,
        Journey.endTime,
        Journey.fare,
        Journey.journeyStatusId,
        Journey.journeyStartingLat,
        Journey.journeyStartingLng,
        
        -- JourneyDecisions data
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.shipperRequestId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver,
        JourneyDecisions.shippingCostByDriver,
        
        -- ShipperRequest data
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.vehicleTypeUniqueId,
        ShipperRequest.originLatitude as shipperOriginLat,
        ShipperRequest.originLongitude as shipperOriginLng,
        ShipperRequest.originPlace as shipperOriginPlace,
        ShipperRequest.destinationLatitude as shipperDestLat,
        ShipperRequest.destinationLongitude as shipperDestLng,
        ShipperRequest.destinationPlace as shipperDestPlace,
        ShipperRequest.shipperRequestCreatedAt,
        ShipperRequest.shippableItemName,
        ShipperRequest.shippableItemQtyInQuintal,
        ShipperRequest.shippingDate,
        ShipperRequest.deliveryDate,
        ShipperRequest.shippingCost,
        
        -- Shipper User data
        shipperUser.fullName as shipperFullName,
        shipperUser.phoneNumber as shipperPhone,
        shipperUser.email as shipperEmail,
        
        -- DriverRequest data
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.originLatitude as driverOriginLat,
        DriverRequest.originLongitude as driverOriginLng,
        DriverRequest.originPlace as driverOriginPlace,
        DriverRequest.driverRequestCreatedAt,
        
        -- Driver User data
        driverUser.fullName as driverFullName,
        driverUser.phoneNumber as driverPhone,
        driverUser.email as driverEmail
        
      FROM Journey 
      INNER JOIN JourneyDecisions ON Journey.journeyDecisionUniqueId = JourneyDecisions.journeyDecisionUniqueId 
      INNER JOIN ShipperRequest ON JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
      INNER JOIN DriverRequest ON JourneyDecisions.driverRequestId = DriverRequest.driverRequestId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      WHERE Journey.journeyStatusId = ?
      ORDER BY Journey.endTime DESC
      LIMIT ? OFFSET ?`;
    const [completedJourneys] = await executor.query(dataSql, [journeyStatusMap.journeyCompleted, safeLimit, offset]);

    // Transform data into structured format
    const fullData = completedJourneys.map(row => ({
      decision: {
        journeyDecisionId: row.journeyDecisionId,
        shipperRequestId: row.shipperRequestId,
        driverRequestId: row.driverRequestId,
        decisionTime: row.decisionTime,
        decisionBy: row.decisionBy,
        shippingDateByDriver: row.shippingDateByDriver,
        deliveryDateByDriver: row.deliveryDateByDriver,
        shippingCostByDriver: row.shippingCostByDriver
      },
      journey: {
        journeyId: row.journeyId,
        journeyUniqueId: row.journeyUniqueId,
        journeyDecisionUniqueId: row.journeyDecisionUniqueId,
        startTime: row.startTime,
        endTime: row.endTime,
        fare: row.fare,
        journeyStatusId: row.journeyStatusId,
        journeyStartingLat: row.journeyStartingLat,
        journeyStartingLng: row.journeyStartingLng
      },
      shipper: {
        shipperRequestUniqueId: row.shipperRequestUniqueId,
        userUniqueId: row.shipperUserUniqueId,
        fullName: row.shipperFullName,
        phoneNumber: row.shipperPhone,
        email: row.shipperEmail,
        vehicleTypeUniqueId: row.vehicleTypeUniqueId,
        originLatitude: row.shipperOriginLat,
        originLongitude: row.shipperOriginLng,
        originPlace: row.shipperOriginPlace,
        destinationLatitude: row.shipperDestLat,
        destinationLongitude: row.shipperDestLng,
        destinationPlace: row.shipperDestPlace,
        shipperRequestCreatedAt: row.shipperRequestCreatedAt,
        shippableItemName: row.shippableItemName,
        shippableItemQtyInQuintal: row.shippableItemQtyInQuintal,
        shippingDate: row.shippingDate,
        deliveryDate: row.deliveryDate,
        shippingCost: row.shippingCost
      },
      driver: {
        driverRequestUniqueId: row.driverRequestUniqueId,
        userUniqueId: row.driverUserUniqueId,
        fullName: row.driverFullName,
        phoneNumber: row.driverPhone,
        email: row.driverEmail,
        originLatitude: row.driverOriginLat,
        originLongitude: row.driverOriginLng,
        originPlace: row.driverOriginPlace,
        driverRequestCreatedAt: row.driverRequestCreatedAt
      }
    }));

    // Get total count of completed journeys
    const countSql = `
      SELECT COUNT(*) as total
      FROM Journey 
      WHERE Journey.journeyStatusId = ?`;
    const [countResult] = await executor.query(countSql, [journeyStatusMap.journeyCompleted]);
    const totalCount = countResult[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);
    return {
      message: "Completed journeys fetched successfully",
      data: fullData,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalItems: totalCount,
        limit: safeLimit
      }
    };
  } catch (error) {
    throw new AppError(error.message || "Failed to get all completed journeys", error.statusCode || AppError.INTERNAL_SERVER_ERROR);
  }
};
// In your journey service - replace all existing GET methods with this single one

// Unified method to get journeys with comprehensive filtering
// Unified method to get journeys with exact response structure

// Unified method to get journeys with exact response structure

module.exports = {
  getAllCompletedJourneys
};
