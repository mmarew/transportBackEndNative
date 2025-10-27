const { pool } = require("../Middleware/Database.config");

// Create a new journey route point
exports.createJourneyRoutePoint = async (body) => {
  const { journeyDecisionUniqueId, latitude, longitude } = body;
  const sql = `INSERT INTO JourneyRoutePoints (journeyDecisionUniqueId, latitude, longitude) VALUES (?, ?, ?)`;
  const values = [journeyDecisionUniqueId, latitude, longitude];
  const [result] = await pool.query(sql, values);
  return {
    message: "success",
    data: "journey route point created successfully",
  };
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (journeyDecisionUniqueId) => {
  console.log(
    "@getJourneyRoutePoints journeyDecisionUniqueId",
    journeyDecisionUniqueId
  );
  const sql = `SELECT * FROM JourneyRoutePoints WHERE journeyDecisionUniqueId = ? ORDER BY timestamp`;
  const [result] = await pool.query(sql, [journeyDecisionUniqueId]);

  return { message: "success", data: result };
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
