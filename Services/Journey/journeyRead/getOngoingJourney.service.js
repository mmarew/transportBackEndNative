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
const {
  getVehicles
} = require("../../Vehicle.service");
const {
  
  getDriverRequestByRequestId,
  getShipperRequestByShipperRequestId
} = require("../journeyHelper");

// Get all journeys with pagination

// Get ongoing journey with pagination
const getOngoingJourney = async ({
  page = 1,
  limit = 10,
  filters = {}
}) => {
  const executor = transactionStorage.getStore() || pool;
  try {
    const {
      fullName,
      phone,
      email,
      search,
      roleId,
      ownerUserUniqueId
    } = filters || {};
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
      throw new Error("Invalid role ID");
    }
    const {
      joinTable,
      joinCondition,
      userField
    } = roleConfig[roleId];
    const safePage = Math.max(1, parseInt(page) || 1);
    const safeLimit = Math.min(Math.max(1, parseInt(limit) || 10), 100);
    const offset = (safePage - 1) * safeLimit;

    // Build explicit SQL instead of using performJoinSelect to avoid extra abstraction
    const queryWhereParts = [];
    const queryParams = [];

    // owner condition if ownerUserUniqueId is given
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`${userField} = ?`);
      queryParams.push(ownerUserUniqueId);
    }

    // journey status condition
    queryWhereParts.push(`Journey.journeyStatusId = ?`);
    queryParams.push(journeyStatusMap.journeyStarted);

    // user-based filters (fullName, phone, email, search)

    if (fullName) {
      queryWhereParts.push(`Users.fullName LIKE ?`);
      queryParams.push(`%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(`Users.phoneNumber LIKE ?`);
      queryParams.push(`%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(`Users.email LIKE ?`);
      queryParams.push(`%${email}%`);
    }
    if (search) {
      queryWhereParts.push(`(Users.fullName LIKE ? OR Users.phoneNumber LIKE ? OR Users.email LIKE ?)`);
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const whereClause = queryWhereParts.length ? `WHERE ${queryWhereParts.join(" AND ")}` : "";
    const sql = `
      SELECT Journey.*, JourneyDecisions.*
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN ${joinTable} ON ${joinCondition}
      JOIN Users ON ${joinTable}.userUniqueId = Users.userUniqueId
      ${whereClause}
      ORDER BY Journey.journeyId DESC
      LIMIT ? OFFSET ?
    `;

    // push limit and offset
    queryParams.push(safeLimit, offset);
    const [rows] = await executor.query(sql, queryParams);
    const ongoingJourneys = rows;

    // Count query (mirror filters and joins used above)
    const countWhereParts = ["Journey.journeyStatusId = ?"];
    const countParams = [journeyStatusMap.journeyStarted];
    if (ownerUserUniqueId !== "all") {
      countWhereParts.push(`${userField} = ?`);
      countParams.push(ownerUserUniqueId);
    }
    // include user-based filters in count params
    if (fullName) {
      countWhereParts.push(`Users.fullName LIKE ?`);
      countParams.push(`%${fullName}%`);
    }
    if (phone) {
      countWhereParts.push(`Users.phoneNumber LIKE ?`);
      countParams.push(`%${phone}%`);
    }
    if (email) {
      countWhereParts.push(`Users.email LIKE ?`);
      countParams.push(`%${email}%`);
    }
    if (search) {
      countWhereParts.push(`(Users.fullName LIKE ? OR Users.phoneNumber LIKE ? OR Users.email LIKE ?)`);
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    const countSql = `
      SELECT COUNT(*) as total
      FROM Journey
      JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      JOIN ${joinTable} ON ${joinCondition}
      JOIN Users ON ${joinTable}.userUniqueId = Users.userUniqueId
      WHERE ${countWhereParts.join(" AND ")}
    `;
    const [countRows] = await executor.query(countSql, countParams);
    const totalCount = countRows[0]?.total || 0;
    const totalPages = Math.ceil(totalCount / safeLimit);
    const data = await Promise.all(ongoingJourneys.map(async item => {
      const [shipperData, driverData] = await Promise.all([getShipperRequestByShipperRequestId(item.shipperRequestId), getDriverRequestByRequestId(item.driverRequestId)]);
      // get vehicle of driver based on driver data

      const driver = driverData.data;
      const vehicle = await getVehicles({
        ownerUserUniqueId: driver?.userUniqueId
      });
      return {
        shipper: shipperData.data,
        driver: {
          driver: driverData.data,
          vehicle: vehicle?.data[0]
        },
        journey: item
      };
    }));
    return {
      message: "success",
      data,
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit
      }
    };
  } catch (error) {
    throw new AppError(error.message || "Failed to get ongoing journeys", error.statusCode || 500);
  }
};

// (removed) searchOngoingJourneyByUserData - functionality merged into getOngoingJourney

// Get all completed journeys with pagination (OPTIMIZED)

module.exports = {
  getOngoingJourney
};
