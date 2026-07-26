const { checkActiveDriverRequest } = require("../../CRUD/Read/ReadData");
const { deleteData, getData } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createDriverRequest } = require("../../CRUD/Create/CreateData");
const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { checkIfDriverIsHealthy } = require("./helpers");
const { verifyDriverJourneyStatus } = require("./statusVerification");
const AppError = require("../../Utils/AppError");

/**
 * Creates a new driver request
 * @param {Object} params - Request parameters
 * @param {Object} params.body - Request body data
 * @param {boolean} params.findNewRequest - Whether to find matching shippers
 * @param {number} params.journeyStatusId - Initial journey status ID
 * @returns {Promise<Object>} Success or error response
 */
const createRequest = async ({
  body,
  findNewRequest = true,
  journeyStatusId,
}) => {
  try {
    const userUniqueId = body?.userUniqueId;
    const isDriverHealthy = await checkIfDriverIsHealthy(userUniqueId);
    if (!isDriverHealthy) {
      throw new AppError("you can't create requests", 403);
    }

    // Check if the driver already has an active request
    let activeRequest = await checkActiveDriverRequest(userUniqueId);

    // Create a new driver request if none exists
    if (activeRequest?.length === 0) {
      await createDriverRequest(body, userUniqueId, journeyStatusId);
      // Recheck active request
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }

    if (!findNewRequest) {
      // When findNewRequest is false, still return standardized format using verifyDriverJourneyStatus
      return await verifyDriverJourneyStatus({
        userUniqueId,
        activeRequest,
      });
    }

    // Find matching shippers and update status
    // This returns the standardized format matching verifyDriverJourneyStatus endpoint
    return await verifyDriverJourneyStatus({
      userUniqueId,
      activeRequest,
    });
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to create request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to create request",
      error.statusCode || 500,
    );
  }
};

/**
 * Deletes a driver request
 * @param {number} requestId - Driver request ID
 * @returns {Promise<Object>} Success or error response
 */
const deleteDriverRequest = async (requestId) => {
  try {
    const result = await deleteData({
      tableName: "DriverRequest",
      conditions: { driverRequestId: requestId },
    });

    if (result.affectedRows === 0) {
      throw new AppError("Request not found", 404);
    }

    return { message: "Driver request deleted", data: null };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to delete request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      error.message || "Unable to delete request",
      error.statusCode || 500,
    );
  }
};

/**
 * Gets driver requests with filtering and pagination
 * @param {Object} params - Query parameters
 * @param {Object} params.data - Filter and pagination data
 * @returns {Promise<Object>} Driver requests with pagination
 */
const getDriverRequest = async ({ data }, connection = null) => {
  try {
    const { userUniqueId, target, page = 1, limit = 10, filters = {} } = data;

    const offset = (page - 1) * limit;
    let whereClause = "";
    let queryParams = [];
    let countParams = [];

    // Build WHERE clause based on target
    if (target !== "all" && userUniqueId) {
      whereClause = "WHERE DriverRequest.userUniqueId = ?";
      queryParams = [userUniqueId];
      countParams = [userUniqueId];
    }

    // Add filter for journeyStatusId
    if (filters.journeyStatusId) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "DriverRequest.journeyStatusId = ?";
      queryParams.push(filters.journeyStatusId);
      countParams.push(filters.journeyStatusId);
    }

    // Add filter for multiple journey statuses (array)
    if (
      filters.journeyStatusIds &&
      Array.isArray(filters.journeyStatusIds) &&
      filters.journeyStatusIds.length > 0
    ) {
      whereClause += whereClause ? " AND " : "WHERE ";
      const placeholders = filters.journeyStatusIds.map(() => "?").join(",");
      whereClause += `DriverRequest.journeyStatusId IN (${placeholders})`;
      queryParams.push(...filters.journeyStatusIds);
      countParams.push(...filters.journeyStatusIds);
    }

    // Add filter by date range (driverRequestCreatedAt)
    if (filters.startDate && filters.endDate) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "DriverRequest.driverRequestCreatedAt BETWEEN ? AND ?";
      queryParams.push(filters.startDate, filters.endDate);
      countParams.push(filters.startDate, filters.endDate);
    } else if (filters.startDate) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "DriverRequest.driverRequestCreatedAt >= ?";
      queryParams.push(filters.startDate);
      countParams.push(filters.startDate);
    } else if (filters.endDate) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "DriverRequest.driverRequestCreatedAt <= ?";
      queryParams.push(filters.endDate);
      countParams.push(filters.endDate);
    }

    // Add filter by origin place (case-insensitive search)
    if (filters.originPlace) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "LOWER(DriverRequest.originPlace) LIKE LOWER(?)";
      queryParams.push(`%${filters.originPlace}%`);
      countParams.push(`%${filters.originPlace}%`);
    }

    // Add filter by username (case-insensitive search)
    if (filters.username) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "LOWER(Users.username) LIKE LOWER(?)";
      queryParams.push(`%${filters.username}%`);
      countParams.push(`%${filters.username}%`);
    }

    // Add filter by email (case-insensitive search)
    if (filters.email) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "LOWER(Users.email) LIKE LOWER(?)";
      queryParams.push(`%${filters.email}%`);
      countParams.push(`%${filters.email}%`);
    }

    // Add filter by phone number
    if (filters.phoneNumber) {
      whereClause += whereClause ? " AND " : "WHERE ";
      whereClause += "Users.phoneNumber LIKE ?";
      queryParams.push(`%${filters.phoneNumber}%`);
      countParams.push(`%${filters.phoneNumber}%`);
    }

    // Add sorting option
    let orderBy = "ORDER BY DriverRequest.driverRequestId DESC";
    if (filters.sortBy) {
      const validSortColumns = [
        "driverRequestCreatedAt",
        "driverRequestId",
        "originPlace",
        "fullName",
      ];
      const sortColumn = validSortColumns.includes(filters.sortBy)
        ? filters.sortBy
        : "driverRequestId";
      const sortOrder =
        filters.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

      if (sortColumn === "fullName") {
        orderBy = `ORDER BY Users.fullName ${sortOrder}`;
      } else {
        orderBy = `ORDER BY DriverRequest.${sortColumn} ${sortOrder}`;
      }
    }

    // Get paginated results
    const sqlToGetRequests = `
      SELECT 
        DriverRequest.*,
        Users.fullName,
        Users.email,
        Users.phoneNumber,
        JourneyStatus.journeyStatusId
      FROM DriverRequest 
      JOIN Users ON Users.userUniqueId = DriverRequest.userUniqueId 
      JOIN JourneyStatus ON JourneyStatus.journeyStatusId = DriverRequest.journeyStatusId
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);

    const executor = connection || pool;
    const [requests] = await executor.query(sqlToGetRequests, queryParams);

    const sqlCount = `
      SELECT COUNT(*) as total 
      FROM DriverRequest 
      JOIN Users ON Users.userUniqueId = DriverRequest.userUniqueId 
      JOIN JourneyStatus ON JourneyStatus.journeyStatusId = DriverRequest.journeyStatusId
      ${whereClause}
    `;

    const [countResult] = await executor.query(sqlCount, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      message: "Driver request operation completed",
      data: requests,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalItems: total,
        limit: parseInt(limit),
        ...(userUniqueId && { userId: userUniqueId }),
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to get driver requests", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Unable to get driver request", 500);
  }
};

/**
 * Gets the current journey status for a driver
 * @param {string} userUniqueId - Driver's unique identifier
 * @returns {Promise<number|null>} Journey status ID or null
 */
const getDriverJourneyStatus = async (userUniqueId) => {
  try {
    const [currentRequest] = await getData({
      tableName: "DriverRequest",
      conditions: { userUniqueId },
      limit: 1,
      orderBy: "driverRequestId",
      orderDirection: "desc",
    });

    const journeyStatusId = currentRequest?.journeyStatusId;
    return journeyStatusId &&
      journeyStatusId < journeyStatusMap.journeyCompleted
      ? journeyStatusId
      : null;
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Error getting current journey status", {
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
};

/**
 * Generic update function for DriverRequest
 * @param {Object} params - Update parameters
 * @param {Object} params.conditions - WHERE conditions
 * @param {Object} params.updateValues - Values to update
 * @returns {Promise<Object>} Success or error response
 */
const updateDriverRequest = async ({ conditions, updateValues }) => {
  try {
    // Validate conditions: use driverRequestUniqueId only (not driverRequestId)
    if (conditions.driverRequestId) {
      throw new AppError("driverRequestId is not allowed", 400);
    }
    if (!conditions.driverRequestUniqueId) {
      throw new AppError("driverRequestUniqueId is required", 400);
    }
    const result = await updateData({
      tableName: "DriverRequest",
      conditions,
      updateValues,
    });

    if (result.affectedRows === 0) {
      throw new AppError("Driver request not found or no changes made", 404);
    }

    return { message: "Driver request updated", data: null };
  } catch (error) {
    throw new AppError(
      error.message || "Unable to update driver request",
      error.statusCode || 500,
    );
  }
};

module.exports = {
  createRequest,
  deleteDriverRequest,
  getDriverRequest,
  getDriverJourneyStatus,
  updateDriverRequest,
};
