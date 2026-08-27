"use strict";


const { pool } = require("../../Middleware/Database.config");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const AppError = require("../../Utils/AppError");

const { journeyStatusMap} = require("../../Utils/ListOfSeedData");

const {  toDateOnly } = require("../../Utils/CurrentDate");


// Helper function for database queries (uses pool by default, connection if provided)
const query = async (sql, values = [], connection = null) => {
  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [result] = await queryExecutor.query(sql, values);
  return result;
};

// Create a new journey
// @param {Object} data - Journey data

// Helper function to get driver request by ID
const getDriverRequestByRequestId = async (driverRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId"},
      ],
      conditions: { driverRequestId }});

    if (result?.length === 0) {
      throw new AppError("Request not found", AppError.NOT_FOUND);
    }

    return { message: "Journey data fetched", data: result[0] };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to retrieve request", {
      error: error.message,
      stack: error.stack});
    throw new AppError(
      error.message || "Unable to retrieve request",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Helper function to get shipper request by ID
const getShipperRequestByShipperRequestId = async (shipperRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "ShipperRequest",
      joins: [
        {
          table: "Users",
          on: "ShipperRequest.userUniqueId = Users.userUniqueId"},
      ],
      conditions: { shipperRequestId }});

    if (result?.length === 0) {
      throw new AppError("Request not found", AppError.NOT_FOUND);
    }

    return { message: "Journey data fetched", data: result[0] };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to retrieve shipper request", {
      shipperRequestId,
      error: error.message,
      stack: error.stack});
    throw new AppError(
      error.message || "Unable to retrieve request",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};
// Normalize date to YYYY-MM-DD (handles both "2025-11-22" and "2025-11-22T00:00:00.000Z")

const getCompletedJourneyCountsByDate = async (filters = {}) => {
  try {
    const {
      ownerUserUniqueId,
      toDate: toDateStr,
      fromDate: fromDateStr,
      userFilters = {}} = filters;
    const fromDateOnly = toDateOnly(fromDateStr);
    const toDateOnlyVal = toDateOnly(toDateStr);

    const { fullName, phone, email, search } = userFilters;

    // Build query conditions - only use journeyCompletedAt for completed journeys
    const queryWhereParts = [
      "Journey.journeyStatusId = ?",
      "Journey.journeyCompletedAt IS NOT NULL", // Only count journeys that have journeyCompletedAt set
    ];
    const queryParams = [journeyStatusMap.journeyCompleted];

    // Owner filter - check both shipper and driver
    if (ownerUserUniqueId && ownerUserUniqueId !== "all") {
      queryWhereParts.push(`
        (ShipperRequest.userUniqueId = ? OR DriverRequest.userUniqueId = ?)
      `);
      queryParams.push(ownerUserUniqueId, ownerUserUniqueId);
    }

    // Date range filter - use journeyCompletedAt only
    if (fromDateStr && toDateStr) {
      if (fromDateOnly && toDateOnlyVal) {
        queryWhereParts.push(
          `DATE(Journey.journeyCompletedAt) >= DATE(?) AND DATE(Journey.journeyCompletedAt) <= DATE(?)`,
        );
        queryParams.push(fromDateOnly, toDateOnlyVal);
      }
    }

    // User-based filters
    if (fullName) {
      queryWhereParts.push(
        `(shipperUser.fullName LIKE ? OR driverUser.fullName LIKE ?)`,
      );
      queryParams.push(`%${fullName}%`, `%${fullName}%`);
    }
    if (phone) {
      queryWhereParts.push(
        `(shipperUser.phoneNumber LIKE ? OR driverUser.phoneNumber LIKE ?)`,
      );
      queryParams.push(`%${phone}%`, `%${phone}%`);
    }
    if (email) {
      queryWhereParts.push(
        `(shipperUser.email LIKE ? OR driverUser.email LIKE ?)`,
      );
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
      queryParams.push(
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
        `%${search}%`,
      );
    }

    const whereClause =
      queryWhereParts.length > 0
        ? ` WHERE ${queryWhereParts.join(" AND ")}`
        : "";

    // Use DATE_FORMAT with journeyCompletedAt only
    const countSql = `
      SELECT 
        DATE_FORMAT(Journey.journeyCompletedAt, '%Y-%m-%d') as journeyDate,
        COUNT(*) as totalCount
      FROM Journey
      INNER JOIN JourneyDecisions ON JourneyDecisions.journeyDecisionUniqueId = Journey.journeyDecisionUniqueId
      INNER JOIN ShipperRequest ON ShipperRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      INNER JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      INNER JOIN Users as shipperUser ON ShipperRequest.userUniqueId = shipperUser.userUniqueId
      INNER JOIN Users as driverUser ON DriverRequest.userUniqueId = driverUser.userUniqueId
      ${whereClause}
      GROUP BY DATE_FORMAT(Journey.journeyCompletedAt, '%Y-%m-%d')
      ORDER BY journeyDate
    `;

    const executor = transactionStorage.getStore() || pool;
    const [countRows] = await executor.query(countSql, queryParams);

    // Transform results into the desired format { date: count, ... }
    const dateCounts = {};
    countRows.forEach((row) => {
      dateCounts[row.journeyDate] = row.totalCount;
    });

    return {
      message: "Journey data fetched",
      data: countRows,
      dateCounts,
      totalDates: countRows.length,
      dateRange: {
        fromDate: fromDateOnly || fromDateStr,
        toDate: toDateOnlyVal || toDateStr}};
  } catch (error) {
    throw new AppError(
      error.message || "Failed to get completed journey counts",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

module.exports = { query, getDriverRequestByRequestId, getShipperRequestByShipperRequestId, getCompletedJourneyCountsByDate };
