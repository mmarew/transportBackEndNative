const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const createJWT = require("../Utils/CreateJWT");
const bcrypt = require("bcryptjs");
const verifyPassword = require("../Utils/VerifyPassword");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");
// Create a new SMS sender
const createSMSSender = async ({ phoneNumber, password, SMSSenderCreatedBy }) => {
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
          isPhoneVerified: 0,
          isEmailVerified: 0,
        });

        return {
          token: token.token,
          message: "success",
          data: "This phone number is already registered",
        };
      } else {
        throw new AppError("Invalid password", 401);
      }
    }

    // If user does not exist, hash the password and create a new record
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = `INSERT INTO SMSSender (phoneNumber, password, SMSSenderCreatedBy) VALUES (?, ?, ?)`;
    const executor = transactionStorage.getStore() || pool;
    const [result] = await executor.query(sql, [phoneNumber, hashedPassword, SMSSenderCreatedBy]);

    if (result.affectedRows === 0) {
      throw new AppError("Failed to create SMSSender record", 500);
    }

    // Generate a token for the new user
    const token = createJWT({
      phoneNumber,
      type: "SMSSender",
      userUniqueId: "SMSSender userUniqueId",
      fullName: "SMSSender fullName",
      email: "SMSSender email",
      roleId: "SMSSender roleId",
      isPhoneVerified: 0,
      isEmailVerified: 0,
    });

    return {
      message: "success",
      data: "OTP sender registered successfully.",
      token: token.token,
    };
  } catch (error) {
    throw new AppError(
      error.message || "Failed to process SMS sender registration",
      error.statusCode || 500,
    );
  }
};

// Get all SMS senders
const getAllSMSSenders = async () => {
  const sql = `SELECT * FROM SMSSender`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql);
  return result;
};

// Get a single SMS sender by ID
const getSMSSenderById = async (id) => {
  const sql = `SELECT * FROM SMSSender WHERE SMSSenderId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [id]);
  return result[0];
};

// Update an SMS sender by ID
const updateSMSSender = async (id, { phoneNumber, password }) => {
  const sql = `UPDATE SMSSender SET phoneNumber = ?, password = ? WHERE SMSSenderId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [phoneNumber, password, id]);
  return result;
};

// Delete an SMS sender by ID
const deleteSMSSender = async (id) => {
  const sql = `DELETE FROM SMSSender WHERE SMSSenderId = ?`;
  const executor = transactionStorage.getStore() || pool;
  const [result] = await executor.query(sql, [id]);
  return result;
};

module.exports = {
  createSMSSender,
  getAllSMSSenders,
  getSMSSenderById,
  updateSMSSender,
  deleteSMSSender,
};
