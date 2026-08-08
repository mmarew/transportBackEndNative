"use strict";

const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const { pool } = require("../../Middleware/Database.config");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
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
    const logger = require("../../Utils/logger");
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
    const { userUniqueId, target, page = 1, limit = 10, filters = {} } = data;
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
    if (target !== "all" && userUniqueId) {
      whereClause = " WHERE ShipperRequest.userUniqueId = ?";
      queryParams = [userUniqueId];
      countParams = [userUniqueId];
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
    if (filters?.shipperRequestUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " ShipperRequest.shipperRequestUniqueId = ?";
      queryParams.push(filters.shipperRequestUniqueId);
      countParams.push(filters.shipperRequestUniqueId);
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
        ShipperRequestBatch.batchId
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
    const logger = require("../../Utils/logger");
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
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Auto-correction: If a sr has no matching decisions (all drivers cancelled/rejected),
 * it is reset to status 1 (waiting) and excluded from the response.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */

/**
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Auto-correction: If a sr has no matching decisions (all drivers cancelled/rejected),
 * it is reset to status 1 (waiting) and excluded from the response.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */

/**
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Auto-correction: If a sr has no matching decisions (all drivers cancelled/rejected),
 * it is reset to status 1 (waiting) and excluded from the response.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */

/**
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Auto-correction: If a sr has no matching decisions (all drivers cancelled/rejected),
 * it is reset to status 1 (waiting) and excluded from the response.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */
const getDetailedJourneyData = async (shipperRequests) => {
  return await executeInTransaction(async () => {
    const executor = transactionStorage.getStore() || pool;
    if (!shipperRequests || shipperRequests.length === 0) {
      return [];
    }
    const waitingResults = [];
    const activeSRs = [];

    // --- Step 1: Pre-filter non-active PRs (no DB hit) ---
    for (const sr of shipperRequests) {
      if (
        sr.journeyStatusId === journeyStatusMap.waiting ||
        sr.journeyStatusId === journeyStatusMap.cancelledByShipper ||
        sr.journeyStatusId === journeyStatusMap.cancelledByDriver
      ) {
        waitingResults.push({
          shipperRequest: sr,
          driverRequests: [],
          decisions: [],
          journey: {},
        });
      } else {
        activeSRs.push(sr);
      }
    }
    if (activeSRs.length === 0) {
      return waitingResults;
    }

    // --- Step 2: Batch fetch all active/positive decisions for all active PRs (1 query) ---
    const srIds = activeSRs.map((sr) => sr.shipperRequestId);
    const positiveStatuses = [
      journeyStatusMap.requested,
      journeyStatusMap.acceptedByDriver,
      journeyStatusMap.acceptedByShipper,
      journeyStatusMap.journeyStarted,
      journeyStatusMap.journeyCompleted,
    ];
    const [allDecisionsRaw] = await executor.query(
      `SELECT * FROM JourneyDecisions WHERE shipperRequestId IN (?) AND journeyStatusId IN (?)`,
      [srIds, positiveStatuses],
    );
    // Group decisions by shipperRequestId
    const decisionsBySR = new Map();
    for (const d of allDecisionsRaw) {
      // if decisionsBySR dont have the shipperRequestId as key, add it with an empty array
      if (!decisionsBySR.has(d.shipperRequestId)) {
        decisionsBySR.set(d.shipperRequestId, []);
      }
      // push the decision to the array of the shipperRequestId
      decisionsBySR.get(d.shipperRequestId).push(d);
    }

    // --- Step 3: Auto-correct stale PRs and handle status mismatches ---
    const staleSRIds = []; // PRs to reset to waiting
    const validSRs = []; // PRs with matching decisions
    const allDecisions = []; // Decisions matching current/updated status

    for (const sr of activeSRs) {
      const decisions = decisionsBySR.get(sr.shipperRequestId) || [];
      if (decisions.length === 0) {
        // No matching active decisions — auto-correct to waiting if not already
        if (sr.journeyStatusId !== journeyStatusMap.waiting) {
          staleSRIds.push(sr.shipperRequestId);
        }
      } else {
        // Check if sr status needs advancement (status mismatch where decisions are ahead)
        const maxDecisionStatus = Math.max(
          ...decisions.map((d) => d.journeyStatusId),
        );
        if (maxDecisionStatus > sr.journeyStatusId) {
          logger.warn("@getDetailedJourneyData: auto-advancing sr status", {
            shipperRequestId: sr.shipperRequestId,
            oldStatus: sr.journeyStatusId,
            newStatus: maxDecisionStatus,
          });
          await executor.query(
            "UPDATE ShipperRequest SET journeyStatusId = ? WHERE shipperRequestId = ?",
            [maxDecisionStatus, sr.shipperRequestId],
          );
          sr.journeyStatusId = maxDecisionStatus; // Sync in-memory
        }

        // Collect decisions matching the final status
        const finalMatches = decisions.filter(
          (d) => d.journeyStatusId === sr.journeyStatusId,
        );
        if (finalMatches.length > 0) {
          allDecisions.push(...finalMatches);
          validSRs.push(sr);
        } else {
          // If no decisions match even after possible advancement, it's stale
          staleSRIds.push(sr.shipperRequestId);
        }
      }
    }

    // Batch update stale PRs to waiting
    if (staleSRIds.length > 0) {
      await executor.query(
        `UPDATE ShipperRequest SET journeyStatusId = ? WHERE shipperRequestId IN (?)`,
        [journeyStatusMap.waiting, staleSRIds],
      );
    }
    if (validSRs.length === 0) {
      return waitingResults;
    }

    // --- Step 4: Batch fetch all driver requests + user info (1 query) ---
    const allDriverRequestIds = allDecisions.map((d) => d.driverRequestId);
    const uniqueDriverRequestIds = [...new Set(allDriverRequestIds)];
    let driversByRequestId = new Map();
    if (uniqueDriverRequestIds.length > 0) {
      const [allDrivers] = await executor.query(
        `SELECT DR.*, U.userId, U.fullName, U.phoneNumber, U.email,
                U.userCreatedAt, U.userCreatedBy, U.userDeletedAt, U.userDeletedBy,
                U.isDeleted
         FROM DriverRequest DR
         JOIN Users U ON DR.userUniqueId = U.userUniqueId
         WHERE DR.driverRequestId IN (?)`,
        [uniqueDriverRequestIds],
      );
      for (const dr of allDrivers) {
        driversByRequestId.set(dr.driverRequestId, dr);
      }
    }

    // --- Step 5: Batch fetch all vehicles (1 query) ---
    const allDriverUserIds = [
      ...new Set([...driversByRequestId.values()].map((dr) => dr.userUniqueId)),
    ];
    let vehiclesByDriver = new Map();
    if (allDriverUserIds.length > 0) {
      const [allVehicles] = await executor.query(
        `SELECT V.*, VD.vehicleDriverId, VD.vehicleDriverUniqueId,
                VD.driverUserUniqueId, VD.assignmentStatus, VD.assignmentStartDate,
                VD.assignmentEndDate, VD.vehicleDriverCreatedBy, VD.vehicleDriverUpdatedBy,
                VD.vehicleDriverDeletedBy, VD.vehicleDriverCreatedAt, VD.vehicleDriverUpdatedAt,
                VD.vehicleDriverDeletedAt,
                VT.vehicleTypeId, VT.vehicleTypeName, VT.vehicleTypeIconName,
                VT.vehicleTypeDescription, VT.vehicleTypeCreatedBy, VT.vehicleTypeUpdatedBy,
                VT.vehicleTypeDeletedBy, VT.carryingCapacity, VT.vehicleTypeUpdatedAt,
                VT.vehicleTypeCreatedAt, VT.vehicleTypeDeletedAt
         FROM Vehicle V
         JOIN VehicleDriver VD ON V.vehicleUniqueId = VD.vehicleUniqueId
         JOIN VehicleTypes VT ON V.vehicleTypeUniqueId = VT.vehicleTypeUniqueId
         WHERE VD.driverUserUniqueId IN (?) AND VD.assignmentStatus = 'active'`,
        [allDriverUserIds],
      );
      for (const v of allVehicles) {
        vehiclesByDriver.set(v.driverUserUniqueId, v);
      }
    }

    // --- Step 6: Batch fetch all profile photos (1 query) ---
    let photosByDriver = new Map();
    if (allDriverUserIds.length > 0) {
      const [allPhotos] = await executor.query(
        `SELECT attachedDocumentCreatedByUserId, attachedDocumentName
         FROM AttachedDocuments
         WHERE attachedDocumentCreatedByUserId IN (?)
           AND documentTypeId = ?
         ORDER BY attachedDocumentId DESC`,
        [allDriverUserIds, listOfDocumentsTypeAndId.profilePhoto],
      );

      // Take the latest photo per driver (first result due to DESC order)
      for (const photo of allPhotos) {
        if (!photosByDriver.has(photo.attachedDocumentCreatedByUserId)) {
          photosByDriver.set(
            photo.attachedDocumentCreatedByUserId,
            photo.attachedDocumentName,
          );
        }
      }
    }

    // --- Step 7: Batch fetch journey data if needed (1 query) ---
    //if the journeyStatusId is journeyStarted or journeyCompleted, then fetch the journey data
    const journeyStatuses = [
      journeyStatusMap.journeyStarted,
      journeyStatusMap.journeyCompleted,
    ];
    const srsNeedingJourney = validSRs.filter((sr) =>
      journeyStatuses.includes(sr.journeyStatusId),
    );
    // console.log("@srsNeedingJourney", srsNeedingJourney);
    let journeyByDecisionUniqueId = new Map();
    if (srsNeedingJourney.length > 0) {
      // Collect ALL decision unique IDs for PRs needing journey data — not just decisions[0],
      // because a sr may have multiple decisions (e.g. one rejected, one accepted/completed).
      // We search across all of them so the correct journey record is always found.
      const journeyDecisionUniqueIds = srsNeedingJourney.flatMap((sr) => {
        const decisions = decisionsBySR.get(sr.shipperRequestId) || [];
        return decisions.map((d) => d.journeyDecisionUniqueId).filter(Boolean);
      });
      const uniqueJourneyDecisionIds = [...new Set(journeyDecisionUniqueIds)];
      if (uniqueJourneyDecisionIds.length > 0) {
        const [allJourneys] = await executor.query(
          `SELECT * FROM Journey WHERE journeyDecisionUniqueId IN (?)`,
          [uniqueJourneyDecisionIds],
        );
        for (const j of allJourneys) {
          journeyByDecisionUniqueId.set(j.journeyDecisionUniqueId, j);
        }
      }
    }

    // --- Step 8: Assemble results (pure JS, no queries) ---
    const activeResults = validSRs.map((sr) => {
      const decisions = decisionsBySR.get(sr.shipperRequestId) || [];
      const driverRequests = decisions
        .map((decision) => {
          const driver = driversByRequestId.get(decision.driverRequestId);
          if (!driver) {
            return null;
          }
          return {
            ...driver,
            vehicleOfDriver: vehiclesByDriver.get(driver.userUniqueId) || null,
            driverProfilePhoto: photosByDriver.get(driver.userUniqueId) || null,
          };
        })
        .filter(Boolean);
      const useJourney = journeyStatuses.includes(sr.journeyStatusId);
      let journey = {};
      if (useJourney) {
        // Find the specific decision that matches the PR's final status.
        // A sr can have multiple decisions (e.g. one rejected offer + one completed offer).
        // Using decisions[0] would pick the wrong one if it's the older, non-journey decision.
        const journeyDecision =
          decisions.find((d) => d.journeyStatusId === sr.journeyStatusId) ||
          decisions[0];
        if (journeyDecision?.journeyDecisionUniqueId) {
          journey =
            journeyByDecisionUniqueId.get(
              journeyDecision.journeyDecisionUniqueId,
            ) || {};
        }
      }
      return {
        shipperRequest: sr,
        driverRequests,
        decisions,
        journey,
      };
    });
    return [...waitingResults, ...activeResults];
  });
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
  getDetailedJourneyData,
  getShipperRequestByUniqueId,
};
