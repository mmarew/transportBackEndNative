const bcrypt = require("bcrypt");
const verifySMSSenderReality = require("../Utils/verifySMSSenderReality");
const { pool } = require("../Middleware/Database.config");

const addSMSSender = async (req) => {
  const { phoneNumber, password } = req.body;

  try {
    // Check if the phone number already exists
    const checkSql = `SELECT * FROM SMSSender WHERE phoneNumber = ?`;
    const [existingSMSSenders] = await pool.query(checkSql, [phoneNumber]);

    if (existingSMSSenders.length > 0) {
      return { message: "error", error: "Phone number already exists" };
    }

    // Encrypt the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const sql = `INSERT INTO SMSSender (phoneNumber, password) VALUES (?, ?)`;
    const [result] = await pool.query(sql, [phoneNumber, hashedPassword]);

    if (result.affectedRows === 0) {
      throw new Error("Unable to add SMSSender");
    }

    return { message: "success", data: "SMSSender added successfully" };
  } catch (error) {
    console.error("Error adding SMSSender:", error);
    return { message: "error", error: "Unable to add SMSSender" };
  }
};

const getSMSSender = async (req) => {
  try {
    const { phoneNumber, password } = req.query;
    let result = await verifySMSSenderReality(phoneNumber, password);
    if (result.message == "error") {
      return { message: "error", error: result.error };
    } else {
      return { message: "success", data: result.data };
    }
  } catch (error) {
    console.log("  error", error);
    return { message: "error", error: "Unable to verify SMSSender" };
  }
};

module.exports = { addSMSSender, getSMSSender };
