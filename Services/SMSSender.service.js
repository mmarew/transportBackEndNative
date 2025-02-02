const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const createJWT = require("../Utils/createJWT");
const bcrypt = require("bcrypt");
const verifyPassword = require("../Utils/VerifyPassword");
// Create a new SMS sender
// service createSMSSenderconst bcrypt = require('bcrypt');
const createSMSSender = async ({ phoneNumber, password }) => {
  try {
    // Check if phone number already exists
    const existingUser = await getData({
      conditions: { phoneNumber },
      tableName: "SMSSender",
    });

    if (existingUser.length > 0) {
      // If user exists, verify the password
      const hashedPassword = existingUser[0].password;
      const { message, data: isPasswordValid } = await verifyPassword({
        hashedPassword,
        notHashedPassword: password,
      });

      if (isPasswordValid && message === "success") {
        // If password is valid, generate a JWT
        const token = createJWT({
          phoneNumber,
          type: "SMSSender",
          userUniqueId: "SMSSender userUniqueId",
          fullName: "SMSSender fullName",
          email: "SMSSender email",
          roleId: "SMSSender roleId",
        });

        return {
          token: token.token,
          message: "success",
          data: "This phone number is already registered",
        };
      } else {
        return {
          message: "error",
          data: "Invalid password",
          error: "Invalid password",
        };
      }
    }

    // If user does not exist, hash the password and create a new record
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO SMSSender (phoneNumber, password) VALUES (?, ?)`;
    const [result] = await pool.query(sql, [phoneNumber, hashedPassword]);

    if (result.affectedRows === 0) {
      throw new Error("Failed to create SMSSender record");
    }

    // Generate a token for the new user
    const token = createJWT({
      phoneNumber,
      type: "SMSSender",
      userUniqueId: "SMSSender userUniqueId",
      fullName: "SMSSender fullName",
      email: "SMSSender email",
      roleId: "SMSSender roleId",
    });

    return {
      message: "success",
      data: "OTP sender registered successfully.",
      token: token.token,
    };
  } catch (error) {
    console.error(
      "Error in createSMSSender service:",
      error.message || error,
      error.stack
    );
    throw error; // Rethrow the error to be caught by the controller
  }
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
