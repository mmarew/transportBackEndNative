const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getDataOfSingleDecision } = require("../CRUD/Read/ReadData");

const registerDecision = async ({ requestUniqueId, waitUniqueId, actor }) => {
  const decisionUniqueId = uuidv4();
  const sql = `INSERT INTO journeyDecisions (decisionUniqueId, passengerRequestUniqueId, driverWaitUniqueId, actor) VALUES (?, ?, ?, ?)`;
  const value = [decisionUniqueId, requestUniqueId, waitUniqueId, actor];
  try {
    const [rows] = await pool.query(sql, value);
    if (rows.affectedRows > 0) {
      const decision = await getDataOfSingleDecision(
        "decisionUniqueId",
        decisionUniqueId
      );
      return {
        ...decision,
        message: "success",
        data: "Decision registered successfully",
      };
    } else {
      return { message: "error", data: "Decision registration failed" };
    }
  } catch (error) {
    return { message: "error", data: error };
  }
};
module.exports = registerDecision;
