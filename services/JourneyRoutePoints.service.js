const { pool } = require("../Middleware/Database.config");

// Create a new journey route point
exports.createJourneyRoutePoint = async ({
  journeyId,
  latitude,
  longitude,
}) => {
  const sql = `INSERT INTO JourneyRoutePoints (journeyId, latitude, longitude) VALUES (?, ?, ?)`;
  const values = [journeyId, latitude, longitude];
  const [result] = await pool.query(sql, values);

  return {
    message: "success",
    data: { journeyId, latitude, longitude, pointId: result.insertId },
  };
};

// Get all route points for a specific journey
exports.getJourneyRoutePoints = async (journeyId) => {
  const sql = `SELECT * FROM JourneyRoutePoints WHERE journeyId = ? ORDER BY timestamp`;
  const [result] = await pool.query(sql, [journeyId]);

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
