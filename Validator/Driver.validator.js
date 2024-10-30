const { pool } = require("../Middleware/Database.config");

const verifyExistenceOfDriverInWaitingState = async ({ userUniqueId }) => {
  const sql = `SELECT * FROM DriverWait,Users WHERE DriverWait.userUniqueId = Users.userUniqueId and Users.userUniqueId = ? and DriverWait.driverWaitStatusId in ('waiting','accepted','requested','journey started')`;
  const values = [userUniqueId];
  const [rows] = await pool.query(sql, values);
  return rows;
};
module.exports = { verifyExistenceOfDriverInWaitingState };
