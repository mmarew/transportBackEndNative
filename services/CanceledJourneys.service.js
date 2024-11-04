const { pool } = require("../Middleware/Database.config");
const uuidv4 = require("uuid").v4;
// Create a new canceled journey,
exports.createCanceledJourney = async ({
  contextId,
  contextType,
  canceledBy,
  cancellationReasonsTypeId,
  canceledTime,
  roleId,
}) => {
  const canceledJourneyUniqueId = uuidv4();
  const sql = `INSERT INTO CanceledJourneys (canceledJourneyUniqueId, contextId, contextType, canceledBy, cancellationReasonsTypeId, canceledTime, roleId)
        VALUES (?, ?, ?, ?, ?, ?,?)
    `;
  const values = [
    canceledJourneyUniqueId,
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime || new Date(),
    roleId,
  ];
  const [result] = await pool.query(sql, values);
  return {
    message: "success",
    data: "Canceled journey created successfully",
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
  const [result] = await pool.query(sql, values);
  return result;
};

// Get a specific canceled journey by ID
exports.getCanceledJourneyById = async (canceledJourneyUniqueId) => {
  const sql = `SELECT * FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?`;
  const [result] = await pool.query(sql, [canceledJourneyUniqueId]);
  return result[0];
};

// Update a canceled journey by ID
exports.updateCanceledJourney = async (canceledJourneyUniqueId, data) => {
  const sql = `
        UPDATE CanceledJourneys 
        SET contextId = ?, contextType = ?, canceledBy = ?, cancellationReasonsTypeId = ?, canceledTime = ?
        WHERE canceledJourneyUniqueId = ?
    `;
  const values = [
    data.contextId,
    data.contextType,
    data.canceledBy,
    data.cancellationReasonsTypeId,
    data.canceledTime || new Date(),
    canceledJourneyUniqueId,
  ];
  const [result] = await pool.query(sql, values);
  return result.affectedRows > 0
    ? { message: "Canceled journey updated successfully" }
    : { message: "Failed to update canceled journey" };
};

// Delete a canceled journey by ID
exports.deleteCanceledJourney = async (canceledJourneyUniqueId) => {
  const sql = `DELETE FROM CanceledJourneys WHERE canceledJourneyUniqueId = ?`;
  const [result] = await pool.query(sql, [canceledJourneyUniqueId]);
  return result.affectedRows > 0
    ? { message: "Canceled journey deleted successfully" }
    : { message: "Failed to delete canceled journey" };
};
exports.getCanceledJourneysByUserUniqueId = async (userUniqueId, roleId) => {
  const sql = `SELECT * FROM CanceledJourneys WHERE canceledBy = ? and roleId = ?`;
  const [result] = await pool.query(sql, [userUniqueId, roleId]);
  return result;
};
