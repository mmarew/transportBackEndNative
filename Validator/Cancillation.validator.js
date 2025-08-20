const { pool } = require("../Middleware/Database.config");

const verifyExistanceOfCancellationReasons = async (reason) => {
  // Query to check existence in the CancellationReasons table
  const sqlToCheckCancellationReasons = `SELECT * FROM CancellationReasonsType WHERE CancellationReasonType = ?`;
  const values = [reason];
  const [result] = await pool.query(sqlToCheckCancellationReasons, values);
  if (result.length > 0) {
    return true;
  } else {
    return false;
  }
};
module.exports = { verifyExistanceOfCancellationReasons };
