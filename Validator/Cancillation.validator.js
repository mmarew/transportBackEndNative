const { pool } = require("../Middleware/Database.config");

const verifyExistanceOfCancilationReasons = async (reason) => {
  // Query to check existence in the cancilationReasons table
  const sqlToCheckCancilationReasons = `SELECT * FROM cancilationReasonsType WHERE cancilationReasonType = ?`;
  const values = [reason];
  const [result] = await pool.query(sqlToCheckCancilationReasons, values);
  if (result.length > 0) {
    return true;
  } else {
    return false;
  }
};
module.exports = { verifyExistanceOfCancilationReasons };
