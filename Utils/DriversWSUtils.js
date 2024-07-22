const { pool } = require("../Middleware/Database.config");

const verifyExistanceOfDriversWaiting = async (driverUniqueId) => {
  const sql = `SELECT * FROM driverWaits WHERE driverUniqueId = ? and status= 'waiting'`;
  const values = [driverUniqueId];
  const [rows] = await pool.query(sql, values);
  //   console.log("@verifyExistanceOfDriversWaiting", rows);
  return rows;
};
module.exports = { verifyExistanceOfDriversWaiting };
