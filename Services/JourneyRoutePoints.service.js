const { pool } = require("../Middleware/Database.config");
const { transactionStorage } = require("../Utils/TransactionContext");
const { v4: uuidv4 } = require("uuid");
const {
  sendSocketIONotificationToPassenger,
} = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes.js");
const { currentDate } = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");

// Create a new journey route point
exports.createJourneyRoutePoint = async (body, connection = null) => {
  try {
    // Input validation
    if (!body || typeof body !== "object") {
      throw new AppError("Invalid request body", 400);
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
        400,
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
        404,
      );
    }

    // Validate coordinate ranges
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      throw new AppError("Invalid coordinates provided", 400);
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
        await sendSocketIONotificationToPassenger({
          phoneNumber: shipperPhoneNumber,
          eventName: "locationUpdateToShipper",
          message: {
            ...additionalData,
            journeyRoutePointsUniqueId,
            journeyDecisionUniqueId,
            latitude,
            longitude,
            message: "success",
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
      message: "success",
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
      error.statusCode || 500,
    );
  }
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (journeyDecisionUniqueId) => {
  try {
    const executor = transactionStorage.getStore() || pool;
    const sql = `SELECT * FROM JourneyRoutePoints WHERE journeyDecisionUniqueId = ? ORDER BY timestamp`;
    const [result] = await executor.query(sql, [journeyDecisionUniqueId]);

    return { message: "success", data: result };
  } catch (error) {
    throw new AppError(
      error.message || "Error getting Journey Route Points",
      error.statusCode || 500,
    );
  }
};

// Update a specific journey route point by pointId
exports.updateJourneyRoutePoint = async (pointId, latitude, longitude) => {
  try {
    const sql = `UPDATE JourneyRoutePoints SET latitude = ?, longitude = ? WHERE pointId = ?`;
    const values = [latitude, longitude, pointId];
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sql, values);

    if (result.affectedRows > 0) {
      return { message: "success", data: { pointId, latitude, longitude } };
    } else {
      throw new AppError("Failed to update journey route point", 404);
    }
  } catch (error) {
    throw new AppError(
      error.message || "Failed to update journey route point",
      error.statusCode || 500,
    );
  }
};

// Delete a specific journey route point by pointId
exports.deleteJourneyRoutePoint = async (pointId) => {
  try {
    const executor = transactionStorage.getStore() || pool;
    const sql = `DELETE FROM JourneyRoutePoints WHERE pointId = ?`;
    const [result] = await executor.query(sql, [pointId]);

    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: `Route point with ID ${pointId} deleted successfully`,
      };
    } else {
      throw new AppError("Failed to delete journey route point", 404);
    }
  } catch (error) {
    throw new AppError(
      error.message || "Failed to delete journey route point",
      error.statusCode || 500,
    );
  }
};
