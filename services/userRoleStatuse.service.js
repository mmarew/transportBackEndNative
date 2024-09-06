const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");

const createUserRoleStatus = async (body) => {
  const { statusId, userRoleId } = body;
  const userRoleStatusUniqueId = uuidv4();
  const verifyResult = await getData({
    tableName: "UserRoleStatuses",
    conditions: { userRoleStatusUniqueId },
  });
  console.log("verifyResult ===========> ", verifyResult);

  if (verifyResult) {
    return { message: "error", data: "User role status already exists" };
  }
  const sql = `INSERT INTO UserRoleStatuses (userRoleStatusUniqueId, statusId, userRoleId) 
               VALUES (?, ?, ?)`;
  const values = [userRoleStatusUniqueId, statusId, userRoleId];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "User role status created successfully",
      };
    }
    return { message: "error", data: "User role status creation failed" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred during user role status creation",
    };
  }
};

const getUserRoleStatus = async (id) => {
  const sql = `SELECT * FROM UserRoleStatuses WHERE userRoleStatusId = ?`;

  try {
    const [rows] = await pool.query(sql, [id]);
    if (rows.length > 0) {
      return { message: "success", data: rows[0] };
    }
    return { message: "error", data: "User role status not found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the user role status",
    };
  }
};

const updateUserRoleStatus = async (id, body) => {
  const { statusId, userRoleId } = body;
  const sql = `UPDATE UserRoleStatuses SET statusId = ?, userRoleId = ? WHERE userRoleStatusId = ?`;
  const values = [statusId, userRoleId, id];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "User role status updated successfully",
      };
    }
    return { message: "error", data: "User role status update failed" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred during user role status update",
    };
  }
};

const deleteUserRoleStatus = async (id) => {
  const sql = `DELETE FROM UserRoleStatuses WHERE userRoleStatusId = ?`;

  try {
    const [result] = await pool.query(sql, [id]);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "User role status deleted successfully",
      };
    }
    return { message: "error", data: "User role status deletion failed" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred during user role status deletion",
    };
  }
};

const getAllUserRoleStatuses = async () => {
  const sql = `SELECT * FROM UserRoleStatuses`;

  try {
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      return { message: "success", data: rows };
    }
    return { message: "error", data: "No user role statuses found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the user role statuses",
    };
  }
};

module.exports = {
  createUserRoleStatus,
  getUserRoleStatus,
  updateUserRoleStatus,
  deleteUserRoleStatus,
  getAllUserRoleStatuses,
};
