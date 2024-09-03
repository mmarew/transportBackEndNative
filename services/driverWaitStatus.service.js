const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { verifyExistanceofWaitingStatus } = require("../CRUD/Read/ReadData");
const currentDate = require("../Utils/currentDate");

// Create a new DriverWaitStatus
const registerDriverWaitStatus = async ({ driverWaitStatus }) => {
  const existance = await verifyExistanceofWaitingStatus(
    "driverWaitStatus",
    driverWaitStatus
  );
  if (existance)
    return { message: "error", data: "DriverWaitStatus already exists" };
  const driverWaitStatusUniqueId = uuidv4();
  const sql = `
    INSERT INTO DriverWaitStatus (driverWaitStatusUniqueId, driverWaitStatus, driverWaitCreatedAt) 
    VALUES (?, ?, ?);
  `;
  const [result] = await pool.query(sql, [
    driverWaitStatusUniqueId,
    driverWaitStatus,
    currentDate(),
  ]);

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "DriverWaitStatus created successfully",
    };
  } else {
    return { message: "error", data: "Failed to create DriverWaitStatus" };
  }
};

// Get all DriverWaitStatuses
const getAllDriverWaitStatuses = async () => {
  const sql = `SELECT * FROM DriverWaitStatus WHERE driverWaitDeletedAt IS NULL`;
  const [results] = await pool.query(sql);

  return results.length > 0
    ? { message: "success", data: results }
    : { message: "error", data: "No DriverWaitStatuses found" };
};

// Update a DriverWaitStatus by ID
const updateDriverWaitStatus = async (id, { driverWaitStatus }) => {
  const sql = `
    UPDATE DriverWaitStatus 
    SET driverWaitStatus = ? 
    WHERE driverWaitStatusUniqueId = ? AND driverWaitDeletedAt IS NULL;
  `;
  const [result] = await pool.query(sql, [driverWaitStatus, id]);

  return result.affectedRows > 0
    ? { message: "success", data: "DriverWaitStatus updated successfully" }
    : { message: "error", data: "Failed to update DriverWaitStatus" };
};

// Delete a DriverWaitStatus by ID
const deleteDriverWaitStatus = async (id) => {
  const sql = `
    UPDATE DriverWaitStatus 
    SET driverWaitDeletedAt =${currentDate()}
    WHERE driverWaitStatusId = ?;
  `;
  const [result] = await pool.query(sql, [id]);

  return result.affectedRows > 0
    ? { message: "success", data: "DriverWaitStatus deleted successfully" }
    : { message: "error", data: "Failed to delete DriverWaitStatus" };
};

module.exports = {
  registerDriverWaitStatus,
  getAllDriverWaitStatuses,
  updateDriverWaitStatus,
  deleteDriverWaitStatus,
};
