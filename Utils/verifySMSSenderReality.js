const bcrypt = require("bcrypt");
const { pool } = require("../Middleware/Database.config");

const verifySMSSenderReality = async (phoneNumber, password) => {
  const sql = `SELECT * FROM SMSSender WHERE phoneNumber = ?`;

  const [result] = await pool.query(sql, [phoneNumber]);

  if (result.length === 0) {
    return { message: "error", error: "SMSSender not found" };
  }

  const smssender = result[0];

  // Verify the password
  const isMatch = await bcrypt.compare(password, smssender.password);
  if (!isMatch) {
    return { message: "error", error: "Invalid password" };
  }

  return { message: "success", data: smssender };
};

module.exports = verifySMSSenderReality;
