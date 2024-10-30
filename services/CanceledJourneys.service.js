const { pool } = require("../Middleware/Database.config");
const uuidv4 = require("uuid").v4;
// Create a new canceled journey
exports.createCanceledJourney = async (data) => {
  const canceledJourneyUniqueId = uuidv4();
  const sql = `
        INSERT INTO CanceledJourneys (canceledJourneyUniqueId, contextId, contextType, canceledBy, cancellationReasonsTypeId, canceledTime)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
  const values = [
    canceledJourneyUniqueId,
    data.contextId,
    data.contextType,
    data.canceledBy,
    data.cancellationReasonsTypeId,
    data.canceledTime || new Date(),
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "Canceled journey created successfully",
    canceledJourneyId: result.insertId,
  };
};

exports.getCanceledJourneysFiltered = async ({
  canceledByRoleId,
  startDate,
  endDate,
}) => {
  let sql = `SELECT * from CanceledJourneys,CancellationReasonsType,Roles WHERE CancellationReasonsType.cancellationReasonsTypeId = CanceledJourneys.cancellationReasonsTypeId and Roles.roleId = CancellationReasonsType.roleId`;

  const values = [];

  // Filter by canceledByRoleId if provided
  if (canceledByRoleId) {
    sql += ` AND Roles.roleId = ?`;
    values.push(canceledByRoleId);
  }

  // Filter by date range if both startDate and endDate are provided
  if (startDate && endDate) {
    sql += ` AND CanceledJourneys.canceledTime BETWEEN ? AND ?`;
    values.push(startDate, endDate);
  }

  // Limit results to 30
  sql += ` LIMIT 30`;
  console.log("sql", sql);
  console.log("first");
  const [result] = await pool.query(sql, values);
  return result;
};

// Get a specific canceled journey by ID
exports.getCanceledJourneyById = async (id) => {
  const sql = `SELECT * FROM CanceledJourneys WHERE canceledJourneyId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update a canceled journey by ID
exports.updateCanceledJourney = async (id, data) => {
  const sql = `
        UPDATE CanceledJourneys 
        SET contextId = ?, contextType = ?, canceledBy = ?, cancellationReasonsTypeId = ?, canceledTime = ?
        WHERE canceledJourneyId = ?
    `;
  const values = [
    data.contextId,
    data.contextType,
    data.canceledBy,
    data.cancellationReasonsTypeId,
    data.canceledTime || new Date(),
    id,
  ];
  const [result] = await pool.query(sql, values);
  return result.affectedRows > 0
    ? { message: "Canceled journey updated successfully" }
    : { message: "Failed to update canceled journey" };
};

// Delete a canceled journey by ID
exports.deleteCanceledJourney = async (id) => {
  const sql = `DELETE FROM CanceledJourneys WHERE canceledJourneyId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result.affectedRows > 0
    ? { message: "Canceled journey deleted successfully" }
    : { message: "Failed to delete canceled journey" };
};
