const { pool } = require("../Middleware/Database.config");

async function FindPassangerForDriver() {
  // create sql to get passanger request in the database with table name of PassengerRequests
  const sql = `SELECT * FROM passengerRequests join passenger on passengerRequests.passengerUniqueId = passenger.passengerUniqueId and passengerRequests.status = "pending" ORDER BY requestId DESC LIMIT 1`;
  const [rows] = await pool.query(sql);
  return rows;
}

module.exports = FindPassangerForDriver;
