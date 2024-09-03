// services/UserStatusService.js
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { verifyExistanceOfUserStatus } = require("../CRUD/Read/ReadData");
const currentDate = require("../Utils/currentDate");

const registerUserStatus = async (body) => {
  const { userStatusName } = body;
  const results = await verifyExistanceOfUserStatus(
    "userStatusName",
    userStatusName
  );
  if (results) return { message: "error", data: "User status already exists" };
  const userStatusUniqueId = uuidv4();
  const sql = `INSERT INTO userStatuses (userStatusUniqueId, userStatusName, userStatusCreatedAt) 
               VALUES (?, ?, ${currentDate()})`;
  const values = [userStatusUniqueId, userStatusName];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "User status registered successfully",
      };
    }
    return { message: "error", data: "User status registration failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during registration" };
  }
};

const getUserStatus = async () => {
  const sql = `SELECT * FROM userStatuses`;

  try {
    const [results] = await pool.query(sql);
    return { message: "success", data: results };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "Failed to retrieve user statuses" };
  }
};

const deleteUserStatus = async (id) => {
  const sql = `DELETE FROM userStatuses WHERE userStatusUniqueId = ?`;

  try {
    const [result] = await pool.query(sql, [id]);
    if (result.affectedRows > 0) {
      return { message: "success", data: "User status deleted successfully" };
    }
    return { message: "error", data: "User status deletion failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during deletion" };
  }
};

const updateUserStatus = async (id, body) => {
  const { userStatusName } = body;
  const sql = `UPDATE userStatuses SET userStatusName = ? WHERE userStatusUniqueId = ?`;

  try {
    const [result] = await pool.query(sql, [userStatusName, id]);
    if (result.affectedRows > 0) {
      return { message: "success", data: "User status updated successfully" };
    }
    return { message: "error", data: "User status update failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during update" };
  }
};

module.exports = {
  registerUserStatus,
  getUserStatus,
  deleteUserStatus,
  updateUserStatus,
};
