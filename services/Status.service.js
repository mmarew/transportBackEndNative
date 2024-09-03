const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const currentDate = require("../Utils/currentDate");
const { verifyExistanceOfData } = require("../CRUD/Read/ReadData");

const createStatus = async (body) => {
  const { statusName } = body;
  const statusUniqueId = uuidv4();

  const verifyResult = await verifyExistanceOfData({
    tableName: "Statuses",
    conditions: { statusName },
  });
  if (verifyResult) {
    return { message: "error", data: "Status already exists" };
  }
  const sql = `INSERT INTO Statuses (statusUniqueId, statusName, statusCreatedAt) 
               VALUES (?, ?,?)`;
  const values = [statusUniqueId, statusName, currentDate()];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Status created successfully" };
    }
    return { message: "error", data: "Status creation failed" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred during status creation",
    };
  }
};

const getStatus = async (id) => {
  const sql = `SELECT * FROM Statuses WHERE statusId = ? AND statusDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(sql, [id]);
    if (rows.length > 0) {
      return { message: "success", data: rows[0] };
    }
    return { message: "error", data: "Status not found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the status",
    };
  }
};

const updateStatus = async (id, body) => {
  const { statusName } = body;
  const sql = `UPDATE Statuses SET statusName = ? WHERE statusId = ? AND statusDeletedAt IS NULL`;
  const values = [statusName, id];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Status updated successfully" };
    }
    return { message: "error", data: "Status update failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during status update" };
  }
};

const deleteStatus = async (id) => {
  const sql = `UPDATE Statuses SET statusDeletedAt = NOW() WHERE statusId = ?`;

  try {
    const [result] = await pool.query(sql, [id]);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Status deleted successfully" };
    }
    return { message: "error", data: "Status deletion failed" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred during status deletion",
    };
  }
};

const getAllStatuses = async () => {
  const sql = `SELECT * FROM Statuses WHERE statusDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      return { message: "success", data: rows };
    }
    return { message: "error", data: "No statuses found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the statuses",
    };
  }
};

module.exports = {
  createStatus,
  getStatus,
  updateStatus,
  deleteStatus,
  getAllStatuses,
};
