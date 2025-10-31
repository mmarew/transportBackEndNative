const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  sendSocketIONotificationToPassenger,
} = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes.js");

// // Create a new journey route point
// exports.createJourneyRoutePoint = async (body) => {
//   const {
//     journeyDecisionUniqueId,
//     latitude,
//     longitude,
//     passengerPhoneNumber,
//     ...data
//   } = body;
//   const journeyRoutePointsUniqueId = uuidv4();
//   const sql = `INSERT INTO JourneyRoutePoints (journeyRoutePointsUniqueId,journeyDecisionUniqueId, latitude, longitude) VALUES (?, ?, ?,?)`;
//   const values = [
//     journeyRoutePointsUniqueId,
//     journeyDecisionUniqueId,
//     latitude,
//     longitude,
//   ];
//   const [result] = await pool.query(sql, values);
//   sendSocketIONotificationToPassenger({
//     phoneNumber: passengerPhoneNumber,
//     eventName: "locationUpdateToShipper",
//     message: {
//       ...data,
//       message: "success",
//       messageTypes: messageTypes.update_drivers_location_to_shipper,
//     },
//   });
//   return {
//     message: "success",
//     data: "journey route point created successfully",
//   };
// };

// Create a new journey route point
exports.createJourneyRoutePoint = async (body) => {
  try {
    // Input validation
    if (!body || typeof body !== "object") {
      throw new Error("Invalid request body");
    }

    const {
      journeyDecisionUniqueId,
      latitude,
      longitude,
      passengerPhoneNumber,
      ...additionalData
    } = body;
    console.log("@createJourneyRoutePoint body", body);
    // Validate required fields
    if (!journeyDecisionUniqueId || !latitude || !longitude) {
      return {
        success: false,
        message:
          "Missing required fields: journeyDecisionUniqueId, latitude, and longitude are required",
      };
    }

    // Validate coordinate ranges
    if (
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return {
        success: false,
        message: "Invalid coordinates provided",
      };
    }

    // Get connection from pool for potential transaction

    const journeyRoutePointsUniqueId = uuidv4();
    const sql = `INSERT INTO JourneyRoutePoints (journeyRoutePointsUniqueId, journeyDecisionUniqueId, latitude, longitude) VALUES (?, ?, ?, ?)`;
    const values = [
      journeyRoutePointsUniqueId,
      journeyDecisionUniqueId,
      latitude,
      longitude,
    ];

    const [result] = await pool.query(sql, values);
    console.log("@createJourneyRoutePoint result ", result);
    // Send notification if passenger phone number is provided
    if (passengerPhoneNumber) {
      try {
        const notifications = await sendSocketIONotificationToPassenger({
          phoneNumber: passengerPhoneNumber,
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
        console.log("@notifications", notifications);
      } catch (notificationError) {
        // Log notification error but don't fail the entire operation
        console.error("Failed to send notification:", notificationError);
        // You might want to implement retry logic or queue failed notifications
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
    console.error("Error creating journey route point:", error);

    return {
      success: false,
      message: "Failed to create journey route point",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    };
  } finally {
  }
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (journeyDecisionUniqueId) => {
  try {
    console.log(
      "@getJourneyRoutePoints journeyDecisionUniqueId",
      journeyDecisionUniqueId
    );
    const sql = `SELECT * FROM JourneyRoutePoints WHERE journeyDecisionUniqueId = ? ORDER BY timestamp`;
    const [result] = await pool.query(sql, [journeyDecisionUniqueId]);

    return { message: "success", data: result };
  } catch (error) {
    return { message: "error", error: "error on get Journey Route Points" };
  }
};

// Update a specific journey route point by pointId
exports.updateJourneyRoutePoint = async (pointId, latitude, longitude) => {
  const sql = `UPDATE JourneyRoutePoints SET latitude = ?, longitude = ? WHERE pointId = ?`;
  const values = [latitude, longitude, pointId];
  const [result] = await pool.query(sql, values);

  if (result.affectedRows > 0) {
    return { message: "success", data: { pointId, latitude, longitude } };
  } else {
    return { message: "error", data: "Failed to update journey route point" };
  }
};

// Delete a specific journey route point by pointId
exports.deleteJourneyRoutePoint = async (pointId) => {
  const sql = `DELETE FROM JourneyRoutePoints WHERE pointId = ?`;
  const [result] = await pool.query(sql, [pointId]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Route point with ID ${pointId} deleted successfully`,
    };
  } else {
    return { message: "error", data: "Failed to delete journey route point" };
  }
};
