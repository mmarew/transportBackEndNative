"use strict";

const Config = require("../../Utils/Config");

const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");

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
const getAllActiveRequests = async (filters = {}) => {
  const {
    // User filters
    userUniqueId,
    email,
    phoneNumber,
    fullName,
    // Request filters
    vehicleTypeUniqueId,
    journeyStatusId,
    shippableItemName,
    // Location filters
    originPlace,
    destinationPlace,
    // Driver proximity (optional): when provided the list is sorted by distance
    driverLatitude,
    driverLongitude,
    // Date filters
    startDate,
    endDate,
    shippingDate,
    deliveryDate,
    // Pagination
    page = 1,
    limit = 2,
    // Sorting
    sortBy = "shipperRequestCreatedAt",
    sortOrder = "DESC",
  } = filters;
  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.acceptedByDriver,
  ];

  const driverLat = Number.parseFloat(driverLatitude);
  const driverLng = Number.parseFloat(driverLongitude);
  const sortByDistance =
    Number.isFinite(driverLat) && Number.isFinite(driverLng);

  // Base query
  let baseQuery = `
    SELECT 
      sr.*, 
      u.fullName,
      u.phoneNumber,
      u.email,
      u.userCreatedAt as userCreatedAt,
      vt.vehicleTypeName,
      js.journeyStatusName,
      srb.batchId
      ${
        sortByDistance
          ? `,
      (6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(sr.originLatitude - ${driverLat}) / 2), 2) +
        COS(RADIANS(${driverLat})) * COS(RADIANS(sr.originLatitude)) *
        POWER(SIN(RADIANS(sr.originLongitude - ${driverLng}) / 2), 2)
      ))) AS distanceKm`
          : ""
      }
    FROM ShipperRequest sr
    JOIN Users u ON u.userUniqueId = sr.userUniqueId 
    LEFT JOIN VehicleTypes vt ON sr.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON sr.journeyStatusId = js.journeyStatusId
    LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
    WHERE sr.journeyStatusId IN (?)
      -- Queue orders are dispatched ONLY by queue FIFO (offer → accept) — they
      -- must never be listed as manually-acceptable online jobs, or a driver
      -- can grab queue placements outside the queue system.
      AND sr.queueOrganizationUniqueId IS NULL
  `;
  let whereConditions = [];
  let values = [activeStatusIds];

  // User filters
  if (userUniqueId) {
    whereConditions.push("sr.userUniqueId = ?");
    values.push(userUniqueId);
  }
  if (email) {
    whereConditions.push("u.email LIKE ?");
    values.push(`%${email}%`);
  }
  if (phoneNumber) {
    whereConditions.push("u.phoneNumber LIKE ?");
    values.push(`%${phoneNumber}%`);
  }
  if (fullName) {
    whereConditions.push("u.fullName LIKE ?");
    values.push(`%${fullName}%`);
  }

  // Request filters
  if (vehicleTypeUniqueId) {
    whereConditions.push("sr.vehicleTypeUniqueId = ?");
    values.push(vehicleTypeUniqueId);
  }
  if (journeyStatusId) {
    whereConditions.push("sr.journeyStatusId = ?");
    values.push(journeyStatusId);
  }
  if (shippableItemName) {
    whereConditions.push("sr.shippableItemName LIKE ?");
    values.push(`%${shippableItemName}%`);
  }

  // Location filters
  if (originPlace) {
    whereConditions.push("sr.originPlace LIKE ?");
    values.push(`%${originPlace}%`);
  }
  if (destinationPlace) {
    whereConditions.push("sr.destinationPlace LIKE ?");
    values.push(`%${destinationPlace}%`);
  }

  // Date filters
  if (startDate && endDate) {
    whereConditions.push("sr.shipperRequestCreatedAt BETWEEN ? AND ?");
    values.push(startDate, endDate);
  } else if (startDate) {
    whereConditions.push("sr.shipperRequestCreatedAt >= ?");
    values.push(startDate);
  } else if (endDate) {
    whereConditions.push("sr.shipperRequestCreatedAt <= ?");
    values.push(endDate);
  }
  if (shippingDate) {
    whereConditions.push("DATE(sr.shippingDate) = ?");
    values.push(shippingDate);
  }
  if (deliveryDate) {
    whereConditions.push("DATE(sr.deliveryDate) = ?");
    values.push(deliveryDate);
  }

  // Add WHERE conditions to base query
  if (whereConditions.length > 0) {
    baseQuery += " AND " + whereConditions.join(" AND ");
  }

  // Count query for total records
  const countQuery = `SELECT COUNT(*) as totalCount FROM (${baseQuery}) as countTable`;

  // Add sorting and pagination to main query
  const offset = (page - 1) * limit;
  baseQuery += sortByDistance
    ? ` ORDER BY distanceKm ASC, sr.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`
    : ` ORDER BY sr.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
  values.push(parseInt(limit), parseInt(offset));
  try {
    // Execute both queries
    // eslint-disable-next-line no-magic-numbers -- drop LIMIT/OFFSET values for count query
    const [countResults] = await pool.query(countQuery, values.slice(0, -2)); // Remove LIMIT and OFFSET values for count
    const [results] = await pool.query(baseQuery, values);
    const totalCount = countResults[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);
    return {
      message: "Active shipper requests fetched successfully",
      data: results,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: totalCount,
        limit: parseInt(limit),
      },
      filters: {
        applied: whereConditions.length > 0 ? filters : {},
        activeStatusIds,
      },
    };
  } catch (error) {
    logger.error("Error in getAllActiveRequests", {
      error: error.message,
      stack: error.stack,
    });
    return {
      status: "error",
      error: "Unable to retrieve active ride requests",
      details: Config.NODE_ENV === "development" ? error.message : undefined,
    };
  }
};

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

module.exports = {
  getAllActiveRequests,
};
