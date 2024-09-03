// services/passengersRequestStatusService.js
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { verifyExistanceOfData } = require("../CRUD/Read/ReadData");
const currentDate = require("../Utils/currentDate");

const getAllPassengersRequestStatus = async () => {
  const sql = `SELECT * FROM PassengersRequestStatus WHERE userJourneyStatusDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      return { message: "success", data: rows };
    }
    return { message: "error", data: "No passenger request statuses found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the statuses",
    };
  }
};
const registerPassengersRequestStatus = async (body) => {
  const { userJourneyStatusName, userJourneyStatusDescription } = body;

  const results = await verifyExistanceOfData({
    tableName: "PassengersRequestStatus",
    conditions: { userJourneyStatusName },
  });

  if (results)
    return {
      message: "error",
      data: "Passenger request status already exists",
    };

  const userJourneyStatusUniqueId = uuidv4();
  const sql = `INSERT INTO PassengersRequestStatus (userJourneyStatusUniqueId, userJourneyStatusName, userJourneyStatusDescription, userJourneyStatusCreatedAt) 
               VALUES (?, ?, ?, ?)`;
  const values = [
    userJourneyStatusUniqueId,
    userJourneyStatusName,
    userJourneyStatusDescription,
    currentDate(),
  ];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Passenger request status registered successfully",
      };
    }
    return {
      message: "error",
      data: "Passenger request status registration failed",
    };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during registration" };
  }
};

const getPassengersRequestStatus = async (id) => {
  const sql = `SELECT * FROM PassengersRequestStatus WHERE userJourneyStatusId = ?`;

  try {
    const [rows] = await pool.query(sql, [id]);
    if (rows.length > 0) {
      return { message: "success", data: rows[0] };
    }
    return { message: "error", data: "Passenger request status not found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the status",
    };
  }
};

const updatePassengersRequestStatus = async (id, body) => {
  const { userJourneyStatusName, userJourneyStatusDescription } = body;
  const sql = `UPDATE PassengersRequestStatus SET userJourneyStatusName = ?, userJourneyStatusDescription = ?, userJourneyStatusDeletedAt = NULL WHERE userJourneyStatusId = ?`;
  const values = [userJourneyStatusName, userJourneyStatusDescription, id];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Passenger request status updated successfully",
      };
    }
    return { message: "error", data: "Passenger request status update failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during the update" };
  }
};

const deletePassengersRequestStatus = async (id) => {
  const sql = `UPDATE PassengersRequestStatus SET userJourneyStatusDeletedAt = ${currentDate()} WHERE userJourneyStatusId = ?`;

  try {
    const [result] = await pool.query(sql, [id]);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Passenger request status deleted successfully",
      };
    }
    return {
      message: "error",
      data: "Passenger request status deletion failed",
    };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during the deletion" };
  }
};

module.exports = {
  getAllPassengersRequestStatus,
  registerPassengersRequestStatus,
  getPassengersRequestStatus,
  updatePassengersRequestStatus,
  deletePassengersRequestStatus,
};
