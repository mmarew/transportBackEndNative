"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  transactionStorage
} = require("../../../Utils/TransactionContext");
const AppError = require("../../../Utils/AppError");
const {
  getUserByFilterDetailed
} = require("../../User.service");
const {
  journeyStatusMap,
  
} = require("../../../Utils/ListOfSeedData");

const {
  query,
  getDriverRequestByRequestId,
  getShipperRequestByShipperRequestId
} = require("../journeyHelper");

// Get all journeys with pagination

// Search completed journey by user data with pagination
const searchCompletedJourneyByUserData = async (phoneOrEmail, roleId, page = 1, limit = 10) => {
  try {
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
    const filters = {
      search: phoneOrEmail
    };
    const usersData = await getUserByFilterDetailed(filters);
    const users = usersData?.data || [];
    if (users.length === 0) {
      return {
        message: "No completed journeys found",
        data: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalItems: 0,
          limit
        }
      };
    }
    const userIds = users.map(user => user.userUniqueId);
    const offset = (page - 1) * limit;
    const roleConfig = {
      1: {
        userField: "ShipperRequest.userUniqueId"
      },
      2: {
        userField: "DriverRequest.userUniqueId"
      }
    };
    if (!roleConfig[roleId]) {
      throw new Error("Invalid role ID");
    }
    const {
      userField
    } = roleConfig[roleId];
    const placeholders = userIds.map(() => "?").join(",");
    const dataSql = `
      SELECT
        Journey.journeyId, Journey.journeyUniqueId, Journey.journeyDecisionUniqueId,
        Journey.startTime, Journey.endTime, Journey.fare, Journey.journeyStatusId,
        Journey.journeyCreatedBy, Journey.journeyUpdatedAt,
        Journey.journeyCreatedAt,
        JourneyDecisions.journeyDecisionId, JourneyDecisions.shipperRequestId,
        JourneyDecisions.driverRequestId, JourneyDecisions.decisionTime,
        JourneyDecisions.decisionBy, JourneyDecisions.shippingDateByDriver,
        JourneyDecisions.deliveryDateByDriver, JourneyDecisions.shippingCostByDriver,
        JourneyDecisions.journeyDecisionCreatedBy
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${userField} IN (${placeholders}) 
        AND Journey.journeyStatusId = ?
      ORDER BY Journey.endTime DESC
      LIMIT ? OFFSET ?
    `;
    const dataValues = [...userIds, journeyStatusMap.journeyCompleted, safeLimit, offset];
    const result = await query(dataSql, dataValues);
    const countSql = ` SELECT COUNT(*) as total  FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${userField} IN (${placeholders}) 
        AND Journey.journeyStatusId = ?
    `;
    const countValues = [...userIds, journeyStatusMap.journeyCompleted];
    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, countValues);
    const totalCount = countRows[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);
    const data = await Promise.all(result.map(async item => {
      const [shipperData, driverData] = await Promise.all([getShipperRequestByShipperRequestId(item.shipperRequestId), getDriverRequestByRequestId(item.driverRequestId)]);
      const journey = {
        journeyUniqueId: item.journeyUniqueId,
        journeyDecisionUniqueId: item.journeyDecisionUniqueId,
        startTime: item.startTime,
        endTime: item.endTime,
        fare: item.fare,
        journeyStatusId: item.journeyStatusId,
        journeyCreatedAt: item.journeyCreatedAt,
      };
      const decision = {
        journeyDecisionUniqueId: item.journeyDecisionUniqueId,
        shipperRequestId: item.shipperRequestId,
        driverRequestId: item.driverRequestId,
        decisionTime: item.decisionTime,
        decisionBy: item.decisionBy,
        shippingDateByDriver: item.shippingDateByDriver,
        deliveryDateByDriver: item.deliveryDateByDriver,
        shippingCostByDriver: item.shippingCostByDriver,
        journeyDecisionCreatedBy: item.journeyDecisionCreatedBy,
      };
      return {
        shipper: shipperData.data,
        driver: driverData.data,
        journey,
        decision,
      };
    }));
    return {
      message: "Completed journeys fetched successfully",
      data,
      pagination: {
        currentPage: safePage,
        totalPages,
        totalItems: totalCount,
        limit: safeLimit
      }
    };
  } catch (error) {
    throw new AppError(error.message || "Failed to search completed journeys", error.statusCode || 500);
  }
};

// Get ongoing journey with pagination

module.exports = {
  searchCompletedJourneyByUserData
};
