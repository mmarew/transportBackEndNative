const { pool } = require("./Database.config");

// middleware/verifyDriverExistence.js
async function verifyDriverExistence(email, phoneNumber) {
  const sqlToCheckExistanceOfDriver = `
    SELECT * FROM driversInfo 
    WHERE email = ? OR phoneNumber = ?;
  `;

  const [existingDrivers] = await pool.query(sqlToCheckExistanceOfDriver, [
    email,
    phoneNumber,
  ]);
  return existingDrivers;
}
module.exports = verifyDriverExistence;
