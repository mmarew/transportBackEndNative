const bcrypt = require("bcrypt");
const verifySMSSenderReality = require("../Utils/verifySMSSenderReality");
const { pool } = require("../Middleware/Database.config");
const verifyPassword = require("../Utils/VerifyPassword");
const createJWT = require("../Utils/createJWT");
const { insertData } = require("../CRUD/Create/CreateData");

const addSMSSender = async (req) => {
  const { phoneNumber, password } = req.body;

  try {
    // Check if the phone number already exists
    const checkSql = `SELECT * FROM SMSSender WHERE phoneNumber = ?`;
    const [existingSMSSenders] = await pool.query(checkSql, [phoneNumber]);
    console.log("existingSMSSenders", existingSMSSenders);
    if (existingSMSSenders.length > 0) {
      const savedPassword = existingSMSSenders[0]?.password;
      // Verify the password
      const { message, data } = await verifyPassword({
        hashedPassword: savedPassword,
        notHashedPassword: password,
      });
      if (message === "error") {
        return { message: "error", error: data };
      }
      const token = await createJWT({ phoneNumber, type: "SMSSender" });
      return {
        token,
        message: "success",
        data: "SMSSender already registered before and password verified successfully",
      };
    }

    // Encrypt the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const result = await insertData({
      tableName: "SMSSender",
      colAndVal: { phoneNumber, password: hashedPassword },
    });
    if (result.affectedRows === 0) {
      throw new Error("Unable to add SMSSender");
    }
    const token = createJWT({ phoneNumber, type: "SMSSender" });
    return { token, message: "success", data: "SMSSender added successfully" };
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
