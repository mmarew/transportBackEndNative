// Database.config.js

const mysql = require("mysql2/promise");

// MySQL connection configuration
const HOST = process.env.HOST;
const USER = process.env.USER;
const PASSWORD = process.env.PASSWORD;
const DATABASE = process.env.DATABASE;

const config = {
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: DATABASE,

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
};

// Create a connection pool
const pool = mysql.createPool(config);

// Function to get a connection from the pool
async function getConnection() {
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.error("Error connecting to the database:", error);
    throw error;
  }
}
getConnection();
module.exports = {
  pool,
};
