"use strict";




const {
  deleteData
} = require("../../CRUD/Delete/DeleteData");


const {
  pool
} = require("../../Middleware/Database.config");


const AppError = require("../../Utils/AppError");


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
 * Deletes a shipper request by ID
 * @param {number} requestId - Shipper request ID
 * @returns {Promise<Object>} Success or error response
 */
const deleteRequest = async requestId => {
  try {
    const result = await deleteData({
      tableName: "ShipperRequest",
      conditions: {
        shipperRequestId: requestId
      }
    });
    if (result.affectedRows === 0) {
      throw new AppError("Request not found", 404);
    }
    return {
      message: "Shipper request deleted successfully",
      data: null
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to delete request", {
      error: error.message,
      stack: error.stack
    });
    throw new AppError("Unable to delete request", error.statusCode || 500);
  }
};

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

module.exports = {
  deleteRequest
};
