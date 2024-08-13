const { pool } = require("../Middleware/Database.config");

const verifyExistenceOfDriverInWaitingState = async (driverUniqueId) => {
  const sql = `SELECT * FROM driverWaits WHERE driverUniqueId = ? and status in ('waiting','accepted','requested','journey started')`;
  const values = [driverUniqueId];
  const [rows] = await pool.query(sql, values);
  return rows;
};
module.exports = { verifyExistenceOfDriverInWaitingState };
