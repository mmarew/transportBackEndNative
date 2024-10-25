const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const currentDate = require("../Utils/currentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");

const createStatus = async (body) => {
  const { statusName, statusDescription, user } = body;
  const userUniqueId = user?.userUniqueId;
  const statusUniqueId = uuidv4();
  const verifyResult = await getData({
    tableName: "Statuses",
    conditions: { statusName },
  });
  if (verifyResult.length > 0) {
    return { message: "error", error: "Status already exists" };
  }

  try {
    // Insert the new status into the database
    const result = await insertData({
      tableName: "Statuses",
      colAndVal: {
        statusUniqueId,
        statusName,
        statusDescription,
        statusCreatedBy: userUniqueId,
        statusCreatedAt: currentDate(),
      },
    });

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
  const sql = `SELECT * FROM Statuses WHERE statusUniqueId = ? AND statusDeletedAt IS NULL`;

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
  const sql = `UPDATE Statuses SET statusName = ? WHERE statusUniqueId = ? AND statusDeletedAt IS NULL`;
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
  const sql = `UPDATE Statuses SET statusDeletedAt = NOW() WHERE statusUniqueId = ?`;

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
