const mysql = require("mysql2/promise");

// MySQL connection configuration
const HOST = process.env.HOST;
const USER = process.env.USER;
const PASSWORD = process.env.PASSWORD;
const DATABASE = process.env.DATABASE;

if (!HOST || !USER || !DATABASE) {
  throw new Error(
    "Missing required environment variables for database connection"
  );
}

const config = {
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
  multipleStatements: true, // Enable multiple statements
};

// Create a connection pool
let pool;

try {
  pool = mysql.createPool(config);
} catch (error) {
  console.error("Error creating database connection pool:", error);
  throw error; // Re-throw the error to ensure the application fails fast
}

// Function to get a connection from the pool
async function getConnection() {
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.error("Error getting connection from the pool:", error);
    throw error;
  }
}

module.exports = {
  pool,
  getConnection,
};
