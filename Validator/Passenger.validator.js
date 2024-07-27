const { pool } = require("../Middleware/Database.config");

const verifyExistanceOfPassangerInWaitingStage = async (passengerUniqueId) => {
  const sql = `SELECT * FROM passengerRequests WHERE passengerUniqueId=? and status="pending"`;
  const values = [passengerUniqueId];
  const [result] = await pool.query(sql, values);
  if (result.length > 0) {
    return result;
  } else {
    return result;
  }
};
module.exports = { verifyExistanceOfPassangerInWaitingStage };
