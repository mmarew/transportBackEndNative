const { getCancellationDetails } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const { getUserByUserUniqueId } = require("./User.service");
const uuidv4 = require("uuid").v4;
// Create a new canceled journey,
exports.createCanceledJourney = async ({
  contextId,
  contextType,
  canceledBy,
  cancellationReasonsTypeId,
  canceledTime,
  roleId,
  driverUserUniqueId,
  passengerUserUniqueId,
}) => {
  const canceledJourneyUniqueId = uuidv4();
  const sql = `INSERT INTO CanceledJourneys (canceledJourneyUniqueId, contextId, contextType, canceledBy, cancellationReasonsTypeId, canceledTime, roleId,  driverUserUniqueId,
  passengerUserUniqueId)
        VALUES (?, ?, ?, ?, ?, ?,?,?,?)
    `;
  const values = [
    canceledJourneyUniqueId,
    contextId,
    contextType,
    canceledBy,
    cancellationReasonsTypeId,
    canceledTime || new Date(),
    roleId,
    driverUserUniqueId,
    passengerUserUniqueId,
  ];
  const [result] = await pool.query(sql, values);
  const cancellationDetails = await getCancellationDetails(contextId);
  return {
    message: "success",
    data: "Canceled journey created successfully",
    canceledJourneyId: result.insertId,
    cancellationDetails: cancellationDetails,
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

//  get drvers information, passengers information, and cancellation details in each canceled journey like [{driver: {}, passenger: {}, cancellationDetails: {}}]
exports.getCanceledJourneys = async (ownerUniqueId, roleId) => {
  console.log("@getCanceledJourneys roleId", roleId);
  let sql = null,
    values = [];
  const userUniqueId =
    roleId == 2 ? "driverUserUniqueId" : "passengerUserUniqueId";
  if (ownerUniqueId == "all") {
    sql = "SELECT * FROM CanceledJourneys where roleId = ?";
    values = [roleId];
  } else {
    sql = `SELECT * FROM CanceledJourneys WHERE ${userUniqueId} =?  and roleId = ?`;
    values = [ownerUniqueId, roleId];
  }
  const [result] = await pool.query(sql, values);

  const data = [];
  for (let i = 0; i < result.length; i++) {
    const driverUserUniqueId = result[i].driverUserUniqueId,
      passengerUserUniqueId = result[i].passengerUserUniqueId;
    const contextId = result[i].contextId;

    const driverData = await getUserByUserUniqueId(driverUserUniqueId);
    const passengerData = await getUserByUserUniqueId(passengerUserUniqueId);
    const cancelationData = await getCancellationDetails(contextId);

    data.push({
      driver: driverData.data,
      passenger: passengerData.data,
      cancellationDetails: cancelationData,
    });
  }

  return { message: "success", data };
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
