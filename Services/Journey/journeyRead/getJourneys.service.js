"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  transactionStorage
} = require("../../../Utils/TransactionContext");
const AppError = require("../../../Utils/AppError");
const {
  repairMissingJourneyByDecision
} = require("../journeyRepair.service");

const {
  
  usersRoles
} = require("../../../Utils/ListOfSeedData");
const {
  getVehicles
} = require("../../Vehicle.service");
const { PAGINATION } = require("../../../Utils/Constants");


// Get all journeys with pagination

// In your journey service - replace all existing GET methods with this single one

// Unified method to get journeys with comprehensive filtering
// Unified method to get journeys with exact response structure

// Unified method to get journeys with exact response structure
const getJourneys = async (filters = {}) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const {
      journeyStatusId,
      journeyUniqueId,
      journeyDecisionUniqueId,
      roleId = usersRoles.driverRoleId,
      ownerUserUniqueId,
      userFilters = {},
      dateFilters = {},
      page = 1,
      limit = 10
    } = filters;
    const {
      fullName,
      phone,
      email,
      search
    } = userFilters;
    const {
      fromDate,
      toDate
    } = dateFilters;
    const roleConfig = {
      1: {
        joinTable: "ShipperRequest",
        joinCondition: "ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId",
        userField: "ShipperRequest.userUniqueId"
      },
      2: {
        joinTable: "DriverRequest",
        joinCondition: "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
        userField: "DriverRequest.userUniqueId"
      }
    };
    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID. Use 1 for shipper or 2 for driver");
    }
    const {
      userField
    } = roleConfig[roleId];
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || PAGINATION.DEFAULT_PAGE_SIZE), PAGINATION.MAX_PAGE_SIZE);
    const offset = (safePage - 1) * safeLimit;

    // Build query conditions
    const queryWhereParts = [];
    const queryParams = [];

    // Journey status filter
    if (journeyStatusId) {
      queryWhereParts.push(`Journey.journeyStatusId = ?`);
      queryParams.push(journeyStatusId);
    }

    // Specific journey ID filter
    if (journeyUniqueId) {
      queryWhereParts.push(`Journey.journeyUniqueId = ?`);
      queryParams.push(journeyUniqueId);
    }

    // Journey decision filter
    if (journeyDecisionUniqueId) {
      queryWhereParts.push(`Journey.journeyDecisionUniqueId = ?`);
      queryParams.push(journeyDecisionUniqueId);
    }

    // Owner filter
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`${userField} = ?`);
      queryParams.push(ownerUserUniqueId);
    }

    // Date range filters
    if (fromDate && toDate) {
      queryWhereParts.push(`DATE(Journey.journeyStartedAt) >= DATE(?) AND DATE(Journey.journeyCompletedAt) <= DATE(?)`);
      queryParams.push(fromDate, toDate);
    } else if (fromDate) {
      queryWhereParts.push(`DATE(Journey.journeyStartedAt) >= DATE(?)`);
      queryParams.push(fromDate);
    } else if (toDate) {
      queryWhereParts.push(`DATE(Journey.journeyCompletedAt) <= DATE(?)`);
      queryParams.push(toDate);
    }

    // User-based filters
    if (fullName) {
      queryWhereParts.push(`(shipperUser.fullName LIKE ? OR driverUser.fullName LIKE ?)`);
      queryParams.push(`%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(`(shipperUser.phoneNumber LIKE ? OR driverUser.phoneNumber LIKE ?)`);
      queryParams.push(`%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(`(shipperUser.email LIKE ? OR driverUser.email LIKE ?)`);
      queryParams.push(`%${email}%`, `%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(
        shipperUser.fullName LIKE ? OR 
        shipperUser.phoneNumber LIKE ? OR 
        shipperUser.email LIKE ? OR
        driverUser.fullName LIKE ? OR
        driverUser.phoneNumber LIKE ? OR 
        driverUser.email LIKE ? OR
        ShipperRequest.originPlace LIKE ? OR
        ShipperRequest.destinationPlace LIKE ? OR
        DriverRequest.originPlace LIKE ?
      )`);
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = queryWhereParts.length > 0 ? ` WHERE ${queryWhereParts.join(" AND ")}` : "";

    // Self-heal: a completed decision can lose its Journey row (the 2026-08-27
    // schema rebuild wiped pre-existing rows). Reconstruct it via the existing
    // createJourney service so journey reads (and the shipper POD screen's
    // journey-by-decision fallback) still resolve a journeyUniqueId. Idempotent —
    // createJourney skips when the row already exists.
    if (journeyDecisionUniqueId) {
      await repairMissingJourneyByDecision(journeyDecisionUniqueId, executor);
    }

    // Fixed SQL query without duplicate joins
    const sql = `
      SELECT 
        -- Journey data
        Journey.journeyId,
        Journey.journeyUniqueId,
        Journey.journeyDecisionUniqueId,
        Journey.journeyStartedAt,
        Journey.journeyCompletedAt,
        Journey.fare,
        Journey.journeyStatusId,
        
        -- JourneyDecisions data
        JourneyDecisions.journeyDecisionId,
        JourneyDecisions.journeyDecisionUniqueId as decisionUniqueId,
        JourneyDecisions.shipperRequestId,
        JourneyDecisions.driverRequestId,
        JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy,
        JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver,
        JourneyDecisions.shippingCostByDriver,
        
        -- ShipperRequest data
        ShipperRequest.shipperRequestId,
        ShipperRequest.shipperRequestUniqueId,
        ShipperRequest.userUniqueId as shipperUserUniqueId,
        ShipperRequest.vehicleTypeUniqueId,
        ShipperRequest.journeyStatusId as shipperJourneyStatusId,
        ShipperRequest.originLatitude as shipperOriginLat,
        ShipperRequest.originLongitude as shipperOriginLng,
        ShipperRequest.originPlace as shipperOriginPlace,
        ShipperRequest.destinationLatitude as shipperDestLat,
        ShipperRequest.destinationLongitude as shipperDestLng,
        ShipperRequest.destinationPlace as shipperDestPlace,
        ShipperRequest.shipperRequestCreatedAt as shipperRequestCreatedAt,
        ShipperRequest.shippableItemName,
        ShipperRequest.shippableItemQtyInQuintal,
        ShipperRequest.shippingDate,
        ShipperRequest.deliveryDate,
        ShipperRequest.shippingCost,
        ShipperRequest.isCompletionSeen,
        ShipperRequest.shipperRequestCreatedBy,
        ShipperRequest.shipperRequestCreatedByRoleId,
        
        -- DriverRequest data
        DriverRequest.driverRequestId,
        DriverRequest.driverRequestUniqueId,
        DriverRequest.userUniqueId as driverUserUniqueId,
        DriverRequest.originLatitude as driverOriginLat,
        DriverRequest.originLongitude as driverOriginLng,
        DriverRequest.originPlace as driverOriginPlace,
        DriverRequest.driverRequestCreatedAt as driverRequestCreatedAt,
        DriverRequest.journeyStatusId as driverJourneyStatusId,
        
        -- Shipper User data
        shipperUser.fullName as shipperFullName,
        shipperUser.phoneNumber as shipperPhone,
        shipperUser.email as shipperEmail,
        shipperUser.userCreatedAt as shipperCreatedAt,
        
        -- Driver User data
        driverUser.fullName as driverFullName,
        driverUser.phoneNumber as driverPhone,
        driverUser.email as driverEmail,
        driverUser.userCreatedAt as driverCreatedAt,
        
        -- Journey Status
        JourneyStatus.journeyStatusName
        
      FROM Journey
      INNER JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      INNER JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      -- Join shipper user data
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
      -- Join driver user data  
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      -- Join journey status
      INNER JOIN JourneyStatus ON JourneyStatus.journeyStatusId = Journey.journeyStatusId
      ${whereClause}
      ORDER BY Journey.journeyId DESC
      LIMIT ? OFFSET ?
    `;
    queryParams.push(safeLimit, offset);
    const [rows] = await executor.query(sql, queryParams);
    const journeys = rows;

    // Count query (fixed - removed the duplicate joinTable)
    const countSql = `
      SELECT COUNT(*) as total
      FROM Journey
      INNER JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      INNER JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      INNER JOIN JourneyStatus ON JourneyStatus.journeyStatusId = Journey.journeyStatusId
      ${whereClause}
    `;
    // eslint-disable-next-line no-magic-numbers -- drop LIMIT/OFFSET values for count query
    const [countRows] = await executor.query(countSql, queryParams.slice(0, -2));
    const totalCount = countRows[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);

    // Build the exact response structure
    const data = await Promise.all(journeys.map(async item => {
      // Get vehicle data for driver
      let vehicle = null;
      if (item.driverUserUniqueId) {
        const vehicleResult = await getVehicles({
          ownerUserUniqueId: item.driverUserUniqueId
        });
        vehicle = vehicleResult?.data?.[0] || null;
      }

      // Build shipper object
      const shipper = {
        shipperRequestId: item.shipperRequestId,
        shipperRequestUniqueId: item.shipperRequestUniqueId,
        userUniqueId: item.shipperUserUniqueId,
        fullName: item.shipperFullName,
        phoneNumber: item.shipperPhone,
        email: item.shipperEmail,
        createdAt: item.shipperCreatedAt,
        vehicleTypeUniqueId: item.vehicleTypeUniqueId,
        journeyStatusId: item.shipperJourneyStatusId,
        originLatitude: item.shipperOriginLat,
        originLongitude: item.shipperOriginLng,
        originPlace: item.shipperOriginPlace,
        destinationLatitude: item.shipperDestLat,
        destinationLongitude: item.shipperDestLng,
        destinationPlace: item.shipperDestPlace,
        shipperRequestCreatedAt: item.shipperRequestCreatedAt,
        shippableItemName: item.shippableItemName,
        shippableItemQtyInQuintal: item.shippableItemQtyInQuintal,
        shippingDate: item.shippingDate,
        deliveryDate: item.deliveryDate,
        shippingCost: item.shippingCost,
        isCompletionSeen: item.isCompletionSeen,
        shipperRequestCreatedBy: item.shipperRequestCreatedBy,
        shipperRequestCreatedByRoleId: item.shipperRequestCreatedByRoleId
      };

      // Build driver object
      const driver = {
        driver: {
          driverRequestId: item.driverRequestId,
          driverRequestUniqueId: item.driverRequestUniqueId,
          userUniqueId: item.driverUserUniqueId,
          fullName: item.driverFullName,
          phoneNumber: item.driverPhone,
          email: item.driverEmail,
          createdAt: item.driverCreatedAt,
          originLatitude: item.driverOriginLat,
          originLongitude: item.driverOriginLng,
          originPlace: item.driverOriginPlace,
          driverRequestCreatedAt: item.driverRequestCreatedAt,
          journeyStatusId: item.driverJourneyStatusId
        },
        vehicle: vehicle
      };

      // Build journey object
      const journey = {
        journeyId: item.journeyId,
        journeyUniqueId: item.journeyUniqueId,
        journeyDecisionUniqueId: item.journeyDecisionUniqueId,
        journeyStartedAt: item.journeyStartedAt,
        journeyCompletedAt: item.journeyCompletedAt,
        fare: item.fare,
        journeyStatusId: item.journeyStatusId,
        journeyStatusName: item.journeyStatusName
      };

      // Build decision object
      const decision = {
        journeyDecisionId: item.journeyDecisionId,
        journeyDecisionUniqueId: item.decisionUniqueId,
        shipperRequestId: item.shipperRequestId,
        driverRequestId: item.driverRequestId,
        decisionTime: item.decisionTime,
        decisionBy: item.decisionBy,
        shippingDateByDriver: item.shippingDateByDriver,
        deliveryDateByDriver: item.deliveryDateByDriver,
        shippingCostByDriver: item.shippingCostByDriver
      };
      // Return exact structure you requested
      return {
        shipper: shipper,
        driver: driver,
        journey: journey,
        decision: decision
      };
    }));
    return {
      message: "Journeys fetched successfully",
      data: data,
      pagination: {
        currentPage: safePage,
        totalPages: totalPages,
        totalItems: totalCount,
        limit: safeLimit
      }
    };
  } catch (error) {
    throw new AppError(error.message || "Failed to get journeys", error.statusCode || AppError.INTERNAL_SERVER_ERROR);
  }
};

module.exports = {
  getJourneys
};
