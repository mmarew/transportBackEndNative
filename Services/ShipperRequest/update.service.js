"use strict";



const {
  updateData
} = require("../../CRUD/Update/Data.update");



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
 *   - shipperRequestBatchId: Required - Batch ID for grouping related requests
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
 * Updates a shipper request by ID
 * @param {number} requestId - Shipper request ID
 * @param {Object} updates - Update values
 * @returns {Promise<Object>} Success or error response
 */
const updateRequestById = async (requestId, updates) => {
  try {
    const result = await updateData({
      tableName: "ShipperRequest",
      conditions: {
        shipperRequestId: requestId
      },
      updateValues: updates
    });
    if (result.affectedRows === 0) {
      throw new AppError("Request not found or no changes made", 404);
    }
    return {
      message: "success",
      data: "Request updated successfully"
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to update request", {
      error: error.message,
      stack: error.stack
    });
    throw new AppError("Unable to update request", error.statusCode || 500);
  }
};

/**
 * Deletes a shipper request by ID
 * @param {number} requestId - Shipper request ID
 * @returns {Promise<Object>} Success or error response
 */

module.exports = {
  updateRequestById
};
