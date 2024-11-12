const { pool } = require("../Middleware/Database.config");
const { getData } = require("../CRUD/Read/ReadData");
const createJWT = require("../Utils/createJWT");
const bcrypt = require("bcrypt");
const verifyPassword = require("../Utils/VerifyPassword");
// Create a new SMS sender
const createSMSSender = async ({ phoneNumber, password }) => {
  const existedData = await getData({
    conditions: { phoneNumber },

    tableName: "SMSSender",
  });
  console.log("existedData =========> ", existedData);
  if (existedData.length > 0) {
    let hashedPassword = existedData[0].password;
    const { message, data } = await verifyPassword({
      hashedPassword,
      notHashedPassword: password,
    });
    console.log("message", message, "data", data);
    if (data && message === "success") {
      {
        const createdToken = createJWT({
          phoneNumber,
          type: "SMSSender",
          userUniqueId: "SMSSender userUniqueId",
          fullName: "SMSSender fullName",
          email: "SMSSender email",
          roleId: "SMSSender roleId",
        });

        return {
          token: createdToken.token,
          message: "success",
          data: "This phone number is already registered",
        };
      }
    } else {
      return {
        message: "error",
        data: "Invalid password",
        error: "Invalid password",
      };
    }
  }

  // create hashed password
  const hashedPassword = await bcrypt.hash(password, 10);
  const sql = `INSERT INTO SMSSender (phoneNumber, password) VALUES (?, ?)`;
  const [result] = await pool.query(sql, [phoneNumber, hashedPassword]);
  const token = createJWT({
    phoneNumber,
    type: "SMSSender",
    type: "SMSSender",
    userUniqueId: "SMSSender userUniqueId",
    fullName: "SMSSender fullName",
    email: "SMSSender email",
    roleId: "SMSSender roleId",
  });
  return {
    message: "success",
    data: "OTP sender registered successfully.",
    token,
  };
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
