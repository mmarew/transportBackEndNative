const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const createJWT = require("../Utils/createJWT");
const bcrypt = require("bcrypt");
// Create a new SMS sender
const createSMSSender = async ({ phoneNumber, password }) => {
  const existedData = await getData({
    conditions: { phoneNumber },

    tableName: "SMSSender",
  });
  if (existedData.length > 0) {
    return {
      message: "error",
      error: "This phone number is already registered",
    };
  }

  // create hashed password
  const hashedPassword = await bcrypt.hash(password, 10);
  const sql = `INSERT INTO SMSSender (phoneNumber, password) VALUES (?, ?)`;
  const [result] = await pool.query(sql, [phoneNumber, hashedPassword]);
  const token = createJWT({ phoneNumber, type: "SMSSender" });
  return {
    message: "success",
    data: "OTP sender registered successfully.",
    token,
  };
  return result;
};

// Get all SMS senders
const getAllSMSSenders = async () => {
  const sql = `SELECT * FROM SMSSender`;
  const [result] = await pool.query(sql);
  return result;
};

// Get a single SMS sender by ID
const getSMSSenderById = async (id) => {
  const sql = `SELECT * FROM SMSSender WHERE SMSSenderId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result[0];
};

// Update an SMS sender by ID
const updateSMSSender = async (id, { phoneNumber, password }) => {
  const sql = `UPDATE SMSSender SET phoneNumber = ?, password = ? WHERE SMSSenderId = ?`;
  const [result] = await pool.query(sql, [phoneNumber, password, id]);
  return result;
};

// Delete an SMS sender by ID
const deleteSMSSender = async (id) => {
  const sql = `DELETE FROM SMSSender WHERE SMSSenderId = ?`;
  const [result] = await pool.query(sql, [id]);
  return result;
};

module.exports = {
  createSMSSender,
  getAllSMSSenders,
  getSMSSenderById,
  updateSMSSender,
  deleteSMSSender,
};
