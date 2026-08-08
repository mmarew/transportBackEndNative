const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { v4: uuidv4 } = require("uuid");
const { sendSocketIONotificationToShipper } = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes.js");
const { currentDate } = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { DOMAIN } = require("../Utils/Constants");

// Create a new journey route point
exports.createJourneyRoutePoint = async (body, connection = null) => {
  try {
    // Input validation
    if (!body || typeof body !== "object") {
      throw new AppError("Invalid request body", AppError.BAD_REQUEST);
    }
    const {
      journeyDecisionUniqueId,
      latitude,
      longitude,
      shipperPhoneNumber,
      userUniqueId,
      ...additionalData
    } = body;
    // Validate required fields
    if (!journeyDecisionUniqueId || !latitude || !longitude || !userUniqueId) {
      throw new AppError(
        "Missing required fields: journeyDecisionUniqueId, latitude, longitude, and userUniqueId are required",
        AppError.BAD_REQUEST,
      );
    }

    // Check if journeyDecisionUniqueId exists
    const existingDecision = await getData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      connection, // Pass connection for transaction support
    });
    if (!existingDecision || existingDecision.length === 0) {
      throw new AppError(
        "Invalid journeyDecisionUniqueId: Journey decision does not exist",
        AppError.NOT_FOUND,
      );
    }

    // Validate coordinate ranges
    if (
      latitude < DOMAIN.LATITUDE_MIN ||
      latitude > DOMAIN.LATITUDE_MAX ||
      longitude < DOMAIN.LONGITUDE_MIN ||
      longitude > DOMAIN.LONGITUDE_MAX
    ) {
      throw new AppError("Invalid coordinates provided", AppError.BAD_REQUEST);
    }

    // Use transaction storage for transaction support, or fall back to provided connection or pool
    const queryExecutor = transactionStorage.getStore() || connection || pool;

    const journeyRoutePointsUniqueId = uuidv4();
    const sql = `INSERT INTO JourneyRoutePoints (journeyRoutePointsUniqueId, journeyDecisionUniqueId, latitude, longitude, journeyRoutePointsCreatedBy, journeyRoutePointsCreatedAt) VALUES (?, ?, ?, ?, ?, ?)`;
    const values = [
      journeyRoutePointsUniqueId,
      journeyDecisionUniqueId,
      latitude,
      longitude,
      userUniqueId,
      currentDate(),
    ];

    await queryExecutor.query(sql, values);
    // Send notification if shipper phone number is provided
    // Note: Notifications sent outside transaction to avoid blocking
    if (shipperPhoneNumber) {
      try {
        await sendSocketIONotificationToShipper({
          phoneNumber: shipperPhoneNumber,
          eventName: "locationUpdateToShipper",
          message: {
            ...additionalData,
            journeyRoutePointsUniqueId,
            journeyDecisionUniqueId,
            latitude,
            longitude,
            message: "Driver location updated",
            messageTypes: messageTypes.update_drivers_location_to_shipper,
          },
        });
      } catch (notificationError) {
        logger.error("Error sending location update notification", {
          error: notificationError.message,
          stack: notificationError.stack,
        });
        // Log notification error but don't fail the entire operation
      }
    }

    return {
      success: true,
      message: "Journey route point created successfully",
      data: {
        journeyRoutePointsUniqueId,
        journeyDecisionUniqueId,
        latitude,
        longitude,
      },
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to create journey route point",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (journeyDecisionUniqueId) => {
  try {
    const executor = transactionStorage.getStore() || pool;
    const sql = `SELECT * FROM JourneyRoutePoints WHERE journeyDecisionUniqueId = ? ORDER BY timestamp`;
    const [result] = await executor.query(sql, [journeyDecisionUniqueId]);

    return { message: "Journey route points fetched successfully", data: result };
  } catch (error) {
    throw new AppError(
      error.message || "Error getting Journey Route Points",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Update a specific journey route point by pointId (partial update)
exports.updateJourneyRoutePoint = async (pointId, latitude, longitude) => {
  try {
    const setParts = [];
    const values = [];

    if (latitude !== undefined) {
      setParts.push("latitude = ?");
      values.push(latitude);
    }
    if (longitude !== undefined) {
      setParts.push("longitude = ?");
      values.push(longitude);
    }

    if (setParts.length === 0) {
      throw new AppError("No fields provided to update", AppError.BAD_REQUEST);
    }

    values.push(pointId);
    const sql = `UPDATE JourneyRoutePoints SET ${setParts.join(", ")} WHERE journeyRoutePointsUniqueId = ?`;
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sql, values);

    if (result.affectedRows > 0) {
      return { message: "Journey route point updated successfully", data: { pointId, latitude, longitude } };
    } else {
      throw new AppError("Failed to update journey route point", AppError.NOT_FOUND);
    }
  } catch (error) {
    throw new AppError(
      error.message || "Failed to update journey route point",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};

// Delete a specific journey route point by journeyRoutePointsUniqueId
exports.deleteJourneyRoutePoint = async (pointId) => {
  try {
    const executor = transactionStorage.getStore() || pool;
    const sql = `DELETE FROM JourneyRoutePoints WHERE journeyRoutePointsUniqueId = ?`;
    const [result] = await executor.query(sql, [pointId]);

    if (result.affectedRows > 0) {
      return {
        message: `Route point with ID ${pointId} deleted successfully`,
        data: null,
      };
    } else {
      throw new AppError("Failed to delete journey route point", AppError.NOT_FOUND);
    }
  } catch (error) {
    throw new AppError(
      error.message || "Failed to delete journey route point",
      error.statusCode || AppError.INTERNAL_SERVER_ERROR,
    );
  }
};
