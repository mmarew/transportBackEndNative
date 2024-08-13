const { pool } = require("../Middleware/Database.config");

const verifyExistanceOfVechle = async (vehicleTypeName) => {
  const sqlToGetVechle = `select * from vechleType where vehicleTypeName = ?`;
  const [vechleInfo] = await pool.query(sqlToGetVechle, [vehicleTypeName]);
  if (vechleInfo.length === 0) return false;
  return true;
};
module.exports = { verifyExistanceOfVechle };
