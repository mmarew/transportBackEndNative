"use strict";

const { performJoinSelect } = require("../../../CRUD/Read/ReadData");
const { pool } = require("../../../Middleware/Database.config");
const { usersRoles } = require("../../../Utils/ListOfSeedData");
const AppError = require("../../../Utils/AppError");
const {
  getDetailedJourneyData,
} = require("./detailed.service");

// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations
// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations

/**
 * Creates a new shipper request
 *
 * This function consolidates three creation scenarios:
 * 1. **Shipper self-creates**: Sets audit fields from token, journeyStatusId = waiting
 * 2. **Admin creates for shipper**: Creates user first, sets audit fields from admin token, journeyStatusId = waiting
 * 3. **Driver takes from street**: Creates user first, sets audit fields from driver info, journeyStatusId = journeyStarted
 *
 * Note: Admin and driver user creation is handled by the caller before calling this function.
 * The caller must pass userUniqueId in the body (for shipper) or create user first (for admin/driver).
 *
 * Audit Trail:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (shipper/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of who created the request (1=shipper, 2=driver, 3=admin)
 * These fields are extracted from body and stored in database to track request origin.
 *
 * Return Behavior:
 * - If shipperRequestCreatedByRoleId ===driverRoleId (2): Returns array of created requests directly
 *   (Driver scenario - no need for status counts, request is used immediately)
 * - Otherwise (shipper/admin): Returns verifyShipperStatus result with status counts
 *   (Shipper/Admin scenario - frontend needs status counts for notifications)
 *
 * @param {Object} body - Request body data
 *   - userUniqueId: Required - Shipper's userUniqueId (set by caller)
 *   - shipperRequestCreatedBy: Required - userUniqueId of who created this request (audit trail)
 *   - shipperRequestCreatedByRoleId: Required - roleId of who created this request (1=shipper, 2=driver, 3=admin)
 *   - shipperRequestBatchUniqueId: Required - Batch ID for grouping related requests
 *   - numberOfVehicles: Optional - Number of   Vehicle needed (default: 1)
 *   - vehicle, destination, originLocation, shippingDate, deliveryDate, shippingCost, etc.
 * @param {number} journeyStatusId - Initial journey status ID
 *   - waiting (1): For shipper/admin scenarios (driver hasn't picked up yet)
 *   - journeyStarted (5): For driver "take from street" scenario (goods already picked up)
 * @param {Object} connection - Optional database connection for transaction support
 *   - If provided, all database operations use this connection (for atomicity)
 *   - If null, uses connection pool (default behavior)
 * @returns {Promise<Object|Array>}
 *   - If driver scenario: Returns array of created request objects directly
 *   - If shipper/admin scenario: Returns verifyShipperStatus result with status counts
 *   - On error: Returns { message: "error", error: "error message" }
 */

/**
 * Gets a shipper request by shipper request ID
 * @param {number} shipperRequestId - Shipper request ID
 * @returns {Promise<Object>} Success or error response with request data
 */

// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations
// verifyShipperStatus removed - only available via API endpoint to reduce heavy operations

/**
 * Creates a new shipper request
 *
 * This function consolidates three creation scenarios:
 * 1. **Shipper self-creates**: Sets audit fields from token, journeyStatusId = waiting
 * 2. **Admin creates for shipper**: Creates user first, sets audit fields from admin token, journeyStatusId = waiting
 * 3. **Driver takes from street**: Creates user first, sets audit fields from driver info, journeyStatusId = journeyStarted
 *
 * Note: Admin and driver user creation is handled by the caller before calling this function.
 * The caller must pass userUniqueId in the body (for shipper) or create user first (for admin/driver).
 *
 * Audit Trail:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (shipper/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of who created the request (1=shipper, 2=driver, 3=admin)
 * These fields are extracted from body and stored in database to track request origin.
 *
 * Return Behavior:
 * - If shipperRequestCreatedByRoleId ===driverRoleId (2): Returns array of created requests directly
 *   (Driver scenario - no need for status counts, request is used immediately)
 * - Otherwise (shipper/admin): Returns verifyShipperStatus result with status counts
 *   (Shipper/Admin scenario - frontend needs status counts for notifications)
 *
 * @param {Object} body - Request body data
 *   - userUniqueId: Required - Shipper's userUniqueId (set by caller)
 *   - shipperRequestCreatedBy: Required - userUniqueId of who created this request (audit trail)
 *   - shipperRequestCreatedByRoleId: Required - roleId of who created this request (1=shipper, 2=driver, 3=admin)
 *   - shipperRequestBatchUniqueId: Required - Batch ID for grouping related requests
 *   - numberOfVehicles: Optional - Number of   Vehicle needed (default: 1)
 *   - vehicle, destination, originLocation, shippingDate, deliveryDate, shippingCost, etc.
 * @param {number} journeyStatusId - Initial journey status ID
 *   - waiting (1): For shipper/admin scenarios (driver hasn't picked up yet)
 *   - journeyStarted (5): For driver "take from street" scenario (goods already picked up)
 * @param {Object} connection - Optional database connection for transaction support
 *   - If provided, all database operations use this connection (for atomicity)
 *   - If null, uses connection pool (default behavior)
 * @returns {Promise<Object|Array>}
 *   - If driver scenario: Returns array of created request objects directly
 *   - If shipper/admin scenario: Returns verifyShipperStatus result with status counts
 *   - On error: Returns { message: "error", error: "error message" }
 */

/**
 * Gets a shipper request by shipper request ID
 * @param {number} shipperRequestId - Shipper request ID
 * @returns {Promise<Object>} Success or error response with request data
 */
const getShipperRequestByShipperRequestId = async (shipperRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "ShipperRequest",
      joins: [
        {
          table: "Users",
          on: "ShipperRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        shipperRequestId,
      },
    });
    return {
      message: "Shipper request fetched successfully",
      data: result[0],
    };
  } catch (error) {
    const logger = require("../../../Utils/logger");
    logger.error("Unable to get shipper request data", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("unable to get data", AppError.INTERNAL_SERVER_ERROR);
  }
};

/**
 * Gets a shipper request by shipper request unique ID
 * @param {string} shipperRequestUniqueId - Shipper request unique ID
 * @returns {Promise<Object>} Success or error response with request data
 */
// DEPRECATED: Use getShipperRequest4allOrSingleUser with filters.shipperRequestUniqueId instead
// const getShipperRequestByShipperRequestUniqueId = async (
//   shipperRequestUniqueId
// ) => {
//   try {
//     const result = await performJoinSelect({
//       baseTable: "ShipperRequest",
//       joins: [
//         {
//           table: "Users",
//           on: "ShipperRequest.userUniqueId = Users.userUniqueId",
//         },
//       ],
//       conditions: {
//         shipperRequestUniqueId,
//       },
//     });

//     if (!result?.length) {
//       return { message: "error", error: "Request not found" };
//     }

//     return { message: "success", data: result[0] };
//   } catch (error) {
//     return { message: "error", error: "Unable to retrieve request" };
//   }
// };

/**
 * Gets shipper requests with filtering and pagination
 * @param {Object} params - Query parameters
 * @param {Object} params.data - Filter and pagination data
 * @returns {Promise<Object>} Shipper requests with pagination
 */

/**
 * Gets a shipper request by shipper request unique ID
 * @param {string} shipperRequestUniqueId - Shipper request unique ID
 * @returns {Promise<Object>} Success or error response with request data
 */
// DEPRECATED: Use getShipperRequest4allOrSingleUser with filters.shipperRequestUniqueId instead
// const getShipperRequestByShipperRequestUniqueId = async (
//   shipperRequestUniqueId
// ) => {
//   try {
//     const result = await performJoinSelect({
//       baseTable: "ShipperRequest",
//       joins: [
//         {
//           table: "Users",
//           on: "ShipperRequest.userUniqueId = Users.userUniqueId",
//         },
//       ],
//       conditions: {
//         shipperRequestUniqueId,
//       },
//     });

//     if (!result?.length) {
//       return { message: "error", error: "Request not found" };
//     }

//     return { message: "success", data: result[0] };
//   } catch (error) {
//     return { message: "error", error: "Unable to retrieve request" };
//   }
// };

/**
 * Gets shipper requests with filtering and pagination
 * @param {Object} params - Query parameters
 * @param {Object} params.data - Filter and pagination data
 * @returns {Promise<Object>} Shipper requests with pagination
 */

/**
 * Gets a shipper request by shipper request unique ID
 * @param {string} shipperRequestUniqueId - Shipper request unique ID
 * @returns {Promise<Object>} Success or error response with request data
 */
// DEPRECATED: Use getShipperRequest4allOrSingleUser with filters.shipperRequestUniqueId instead
// const getShipperRequestByShipperRequestUniqueId = async (
//   shipperRequestUniqueId
// ) => {
//   try {
//     const result = await performJoinSelect({
//       baseTable: "ShipperRequest",
//       joins: [
//         {
//           table: "Users",
//           on: "ShipperRequest.userUniqueId = Users.userUniqueId",
//         },
//       ],
//       conditions: {
//         shipperRequestUniqueId,
//       },
//     });

//     if (!result?.length) {
//       return { message: "error", error: "Request not found" };
//     }

//     return { message: "success", data: result[0] };
//   } catch (error) {
//     return { message: "error", error: "Unable to retrieve request" };
//   }
// };

/**
 * Gets shipper requests with filtering and pagination
 * @param {Object} params - Query parameters
 * @param {Object} params.data - Filter and pagination data
 * @returns {Promise<Object>} Shipper requests with pagination
 */

/**
 * Gets a shipper request by shipper request unique ID
 * @param {string} shipperRequestUniqueId - Shipper request unique ID
 * @returns {Promise<Object>} Success or error response with request data
 */
// DEPRECATED: Use getShipperRequest4allOrSingleUser with filters.shipperRequestUniqueId instead
// const getShipperRequestByShipperRequestUniqueId = async (
//   shipperRequestUniqueId
// ) => {
//   try {
//     const result = await performJoinSelect({
//       baseTable: "ShipperRequest",
//       joins: [
//         {
//           table: "Users",
//           on: "ShipperRequest.userUniqueId = Users.userUniqueId",
//         },
//       ],
//       conditions: {
//         shipperRequestUniqueId,
//       },
//     });

//     if (!result?.length) {
//       return { message: "error", error: "Request not found" };
//     }

//     return { message: "success", data: result[0] };
//   } catch (error) {
//     return { message: "error", error: "Unable to retrieve request" };
//   }
// };

/**
 * Gets shipper requests with filtering and pagination
 * @param {Object} params - Query parameters
 * @param {Object} params.data - Filter and pagination data
 * @returns {Promise<Object>} Shipper requests with pagination
 */
const getShipperRequest4allOrSingleUser = async ({ data }) => {
  try {
    const { userUniqueId, target, page = 1, limit = 10, filters = {}, roleId } = data;
    const offset = (page - 1) * limit;
    let whereClause = "";
    let queryParams = [];
    let countParams = [];
    if (filters?.search) {
      // Find by phone or email or full name or shippableItemName or origin/destination places
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += ` (
    Users.phoneNumber LIKE ? OR 
    Users.email LIKE ? OR 
    Users.fullName LIKE ? OR
    ShipperRequest.shippableItemName LIKE ? OR
    ShipperRequest.originPlace LIKE ? OR
    ShipperRequest.destinationPlace LIKE ?
  )`;
      const searchPattern = `%${filters.search}%`;
      // Add the same pattern for all 6 conditions
      queryParams?.push(
        searchPattern,
        // phoneNumber
        searchPattern,
        // email
        searchPattern,
        // fullName
        searchPattern,
        // shippableItemName
        searchPattern,
        // originPlace
        searchPattern, // destinationPlace
      );
      countParams?.push(
        searchPattern,
        // phoneNumber
        searchPattern,
        // email
        searchPattern,
        // fullName
        searchPattern,
        // shippableItemName
        searchPattern,
        // originPlace
        searchPattern, // destinationPlace
      );
    }

    // Build WHERE clause based on target and filters
    const isQueueStaff =
      roleId === usersRoles.queueOrgAdminRoleId ||
      roleId === usersRoles.queueDispatcherRoleId;
    if (isQueueStaff) {
      // Queue staff (11/12) act on behalf of shippers. They operate inside
      // exactly ONE queue org at a time — the controller resolves and injects
      // filters.queueOrganizationUniqueId (auto-resolve single membership /
      // 400 if ambiguous / 403 if the requested org is not theirs). Scope to
      // that exact org — never a union of all member orgs.
      if (!filters?.queueOrganizationUniqueId) {
        throw new AppError(
          "queueOrganizationUniqueId is required for queue staff",
          AppError.BAD_REQUEST,
        );
      }
      whereClause =
        " WHERE ShipperRequestBatch.queueOrganizationUniqueId = ?";
      queryParams = [filters.queueOrganizationUniqueId];
      countParams = [filters.queueOrganizationUniqueId];
    } else if (target !== "all" && userUniqueId) {
      if (roleId === usersRoles.driverRoleId) {
        // Driver: find requests where this driver was assigned via JourneyDecisions → DriverRequest
        whereClause = ` WHERE EXISTS (
          SELECT 1 FROM JourneyDecisions jd
          INNER JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
          WHERE jd.shipperRequestId = ShipperRequest.shipperRequestId
            AND dr.userUniqueId = ?
        )`;
        queryParams = [userUniqueId];
        countParams = [userUniqueId];
      } else {
        // Shipper/Admin: filter by ShipperRequest owner
        whereClause = " WHERE ShipperRequest.userUniqueId = ?";
        queryParams = [userUniqueId];
        countParams = [userUniqueId];
      }
    }

    // Add additional filters if provided
    if (filters?.vehicleTypeUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.vehicleTypeUniqueId = ?";
      queryParams.push(filters.vehicleTypeUniqueId);
      countParams.push(filters.vehicleTypeUniqueId);
    }

    // If isCompletionSeen is provided
    if (filters?.isCompletionSeen !== undefined) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.isCompletionSeen = ?";
      queryParams.push(filters.isCompletionSeen);
      countParams.push(filters.isCompletionSeen);
    }

    // Handle multiple journeyStatusIds
    if (filters?.journeyStatusIds && filters.journeyStatusIds.length > 0) {
      whereClause += whereClause ? " AND " : " WHERE ";
      if (filters.journeyStatusIds.length === 1) {
        // Single value for efficiency
        whereClause += " ShipperRequest.journeyStatusId = ?";
        queryParams.push(filters.journeyStatusIds[0]);
        countParams.push(filters.journeyStatusIds[0]);
      } else {
        // Multiple values using IN clause
        const placeholders = filters.journeyStatusIds.map(() => "?").join(",");
        whereClause += ` ShipperRequest.journeyStatusId IN (${placeholders})`;
        queryParams.push(...filters.journeyStatusIds);
        countParams.push(...filters.journeyStatusIds);
      }
    }
    if (filters?.shipperRequestBatchUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.shipperRequestBatchUniqueId = ?";
      queryParams.push(filters.shipperRequestBatchUniqueId);
      countParams.push(filters.shipperRequestBatchUniqueId);
    }
    // Only shipper requests that still have a driver request awaiting an
    // answer (DriverRequest.journeyStatusId = 2). Links via JourneyDecisions,
    // which holds both shipperRequestId and driverRequestId.
    if (filters?.hasUnansweredDriverRequest) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += ` EXISTS (
        SELECT 1 FROM JourneyDecisions jd
        INNER JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
        WHERE jd.shipperRequestId = ShipperRequest.shipperRequestId
          AND dr.journeyStatusId = 2
      )`;
    }
    if (filters?.shipperRequestUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.shipperRequestUniqueId = ?";
      queryParams.push(filters.shipperRequestUniqueId);
      countParams.push(filters.shipperRequestUniqueId);
    }

    // Filter by queue organization: lets a QueueOrgAdmin list/filter the jobs
    // created under their queue org (on-behalf-of shipper requests).
    // queueOrganizationUniqueId is canonical on ShipperRequestBatch (srb) — inherited via join.
    if (filters?.queueOrganizationUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequestBatch.queueOrganizationUniqueId = ?";
      queryParams.push(filters.queueOrganizationUniqueId);
      countParams.push(filters.queueOrganizationUniqueId);
    }

    // Filter by requestMode: 'open' (visible to all drivers) or 'company_target' (visible only to targeted company)
    if (filters?.requestMode) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.requestMode = ?";
      queryParams.push(filters.requestMode);
      countParams.push(filters.requestMode);
    }

    // Exclude a specific requestMode while keeping NULL rows (legacy individual requests).
    // e.g. excludeRequestMode='company_target' → AND (requestMode IS NULL OR requestMode != 'company_target')
    // Needed because individual completed view must not show company batch completions.
    if (filters?.excludeRequestMode) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause +=
        " (ShipperRequest.requestMode IS NULL OR ShipperRequest.requestMode != ?)";
      queryParams.push(filters.excludeRequestMode);
      countParams.push(filters.excludeRequestMode);
    }

    // Add date range filters
    if (filters?.startDate && filters?.endDate) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.shipperRequestCreatedAt BETWEEN ? AND ?";
      queryParams.push(filters.startDate, filters.endDate);
      countParams.push(filters.startDate, filters.endDate);
    } else if (filters?.startDate) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.shipperRequestCreatedAt >= ?";
      queryParams.push(filters.startDate);
      countParams.push(filters.startDate);
    } else if (filters?.endDate) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.shipperRequestCreatedAt <= ?";
      queryParams.push(filters.endDate);
      countParams.push(filters.endDate);
    }

    // Add sorting
    let orderBy = "ORDER BY ShipperRequest.shipperRequestId DESC";
    if (filters?.sortBy) {
      const validSortColumns = [
        "shipperRequestCreatedAt",
        "shipperRequestId",
        "originPlace",
        "destinationPlace",
        "fullName",
      ];
      const sortColumn = validSortColumns.includes(filters.sortBy)
        ? filters.sortBy
        : "shipperRequestId";
      const sortOrder =
        filters.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";
      if (sortColumn === "fullName") {
        orderBy = `ORDER BY Users.fullName ${sortOrder}`;
      } else {
        orderBy = `ORDER BY ShipperRequest.${sortColumn} ${sortOrder}`;
      }
    }

    // Get paginated results - Include VehicleTypes join like original
    const sqlToGetRequests = `
      SELECT 
        ShipperRequest.*,
        Users.fullName,
        Users.email,
        Users.phoneNumber,
        VehicleTypes.vehicleTypeName,
        ShipperRequestBatch.batchId,
        ShipperRequestBatch.queueOrganizationUniqueId AS batchQueueOrganizationUniqueId
      FROM ShipperRequest 
      JOIN Users ON Users.userUniqueId = ShipperRequest.userUniqueId
      JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = ShipperRequest.vehicleTypeUniqueId
      LEFT JOIN ShipperRequestBatch ON ShipperRequestBatch.batchUniqueId = ShipperRequest.shipperRequestBatchUniqueId
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;
    queryParams.push(parseInt(limit), offset);
    const [shipperRequests] = await pool.query(sqlToGetRequests, queryParams);
    const sqlCount = `
      SELECT COUNT(*) as total 
      FROM ShipperRequest 
      JOIN Users ON Users.userUniqueId = ShipperRequest.userUniqueId
      JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = ShipperRequest.vehicleTypeUniqueId
      LEFT JOIN ShipperRequestBatch ON ShipperRequestBatch.batchUniqueId = ShipperRequest.shipperRequestBatchUniqueId
      ${whereClause}
    `;
    const [countResult] = await pool.query(sqlCount, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Format data with detailed journey information
    const formattedData = await getDetailedJourneyData(shipperRequests);
    return {
      message: "Shipper requests fetched successfully",
      data: formattedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalItems: total,
        limit: parseInt(limit),
        ...(userUniqueId && {
          userId: userUniqueId,
        }),
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  } catch (error) {
    const logger = require("../../../Utils/logger");
    logger.error("Unable to update request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      "Unable to get shipper requests",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

/**
 * Updates a shipper request by ID
 * @param {number} requestId - Shipper request ID
 * @param {Object} updates - Update values
 * @returns {Promise<Object>} Success or error response
 */

/**
 * Get All Active Requests
 *
 * Purpose: Retrieves all active shipper requests (waiting, requested, acceptedByDriver)
 * for drivers to view available journeys.
 *
 * @param {Object} filters - Filtering options
 * @param {string} filters.userUniqueId - Filter by shipper user ID
 * @param {string} filters.email - Filter by shipper email (partial match)
 * @param {string} filters.phoneNumber - Filter by shipper phone (partial match)
 * @param {string} filters.fullName - Filter by shipper name (partial match)
 * @param {string} filters.vehicleTypeUniqueId - Filter by vehicle type
 * @param {number} filters.journeyStatusId - Filter by specific journey status
 * @param {string} filters.shippableItemName - Filter by item name (partial match)
 * @param {string} filters.originPlace - Filter by origin location (partial match)
 * @param {string} filters.destinationPlace - Filter by destination location (partial match)
 * @param {string} filters.startDate - Filter requests from this date
 * @param {string} filters.endDate - Filter requests until this date
 * @param {string} filters.shippingDate - Filter by shipping date
 * @param {string} filters.deliveryDate - Filter by delivery date
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Results per page (default: 2)
 * @param {string} filters.sortBy - Field to sort by (default: "requestTime")
 * @param {string} filters.sortOrder - Sort direction "ASC" or "DESC" (default: "DESC")
 * @returns {Promise<Object>} Response with data, pagination, and filters
 */

/**
 * Fetches a single ShipperRequest by its UUID.
 *
 * This is the dedicated, reusable service function for looking up a shipper
 * request by unique ID. Used by CompanyAssignment.service.js and any other
 * service that needs to resolve a shipperRequestUniqueId → row without
 * duplicating raw SQL.
 *
 * @param {string} shipperRequestUniqueId  - UUID of the request
 * @param {string} [shipperRequestBatchUniqueId] - Optional: also validates batch membership
 * @returns {Promise<Object>}  The matched row or null if not found
 * @throws {AppError} 404 if not found, 400 if batchId provided but does not match
 */

/**
 * Fetches a single ShipperRequest by its UUID.
 *
 * This is the dedicated, reusable service function for looking up a shipper
 * request by unique ID. Used by CompanyAssignment.service.js and any other
 * service that needs to resolve a shipperRequestUniqueId → row without
 * duplicating raw SQL.
 *
 * @param {string} shipperRequestUniqueId  - UUID of the request
 * @param {string} [shipperRequestBatchUniqueId] - Optional: also validates batch membership
 * @returns {Promise<Object>}  The matched row or null if not found
 * @throws {AppError} 404 if not found, 400 if batchId provided but does not match
 */
const getShipperRequestByUniqueId = async (
  shipperRequestUniqueId,
  shipperRequestBatchUniqueId = null,
) => {
  let sql = `SELECT shipperRequestId,
                    shipperRequestUniqueId,
                    shipperRequestBatchUniqueId,
                    vehicleTypeUniqueId,
                    journeyStatusId,
                    originLatitude,
                    originLongitude,
                    originPlace,
                    shippingCost,
                    userUniqueId
             FROM ShipperRequest
             WHERE shipperRequestUniqueId = ?
               AND shipperRequestDeletedAt IS NULL`;
  const params = [shipperRequestUniqueId];
  if (shipperRequestBatchUniqueId) {
    sql += " AND shipperRequestBatchUniqueId = ?";
    params.push(shipperRequestBatchUniqueId);
  }
  sql += " LIMIT 1";
  const [rows] = await pool.query(sql, params);
  if (!rows || rows.length === 0) {
    if (shipperRequestBatchUniqueId) {
      throw new AppError(
        "Shipper request does not belong to this bid's batch",
        AppError.BAD_REQUEST,
      );
    }
    throw new AppError("Shipper request not found", AppError.NOT_FOUND);
  }
  return rows[0];
};

module.exports = {
  getShipperRequestByShipperRequestId,
  getShipperRequest4allOrSingleUser,
  getShipperRequestByUniqueId,
};
