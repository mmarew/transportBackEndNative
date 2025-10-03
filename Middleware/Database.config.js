const mysql = require("mysql2/promise");

// MySQL connection configuration
const HOST = process.env.DB_HOST;
const USER = process.env.DB_USER;
const PASSWORD = process.env.DB_PASSWORD;
const DATABASE = process.env.DB_DATABASE;
const PORT = Number(process.env.DB_PORT) || 3306;
if (process.env.NODE_ENV !== "production") {
  console.log("@Database.config.js", { HOST, USER, DATABASE, PORT });
}

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
  port: PORT,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
  multipleStatements: false, // Safer by default
  // socketPath: "/Applications/MAMP/tmp/mysql/mysql.sock", // ✅ Correct for MAMP
};

// Create a connection pool
let pool;

try {
  pool = mysql.createPool(config);
  // Verify connectivity on startup (fail fast)
  (async () => {
    try {
      await pool.query("SELECT 1");
      console.log("Database connection pool created successfully");
    } catch (err) {
      console.error("Database startup health check failed:", err);
      process.exit(1);
    }
  })();
  // Attach connection-level error listener
  pool.on("connection", (connection) => {
    connection.on("error", (err) => {
      console.error("MySQL connection error:", err);
    });
  });
  pool.on("acquire", (connection) => {
    // console.log("Connection acquired:", connection.threadId);
  });
  pool.on("release", (connection) => {
    // console.log("Connection released:", connection.threadId);
  });
  pool.on("enqueue", () => {
    console.log("Waiting for a connection...");
  });
  pool.on("end", () => {
    console.log("Database connection pool ended");
  });
  pool.on("remove", (connection) => {
    console.log("Connection removed:", connection.threadId);
  });
} catch (error) {
  console.log("Error creating database connection pool:", error);
  throw error; // Re-throw the error to ensure the application fails fast
}

// Function to get a connection from the pool
async function getConnection() {
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.log("Error getting connection from the pool:", error);
    throw error;
  }
}

// Readiness check helper
async function ping() {
  return pool.query("SELECT 1");
}

// Graceful shutdown
const shutdown = async () => {
  try {
    if (pool) {
      await pool.end();
      console.log("Database pool closed.");
    }
  } catch (e) {
    console.error("Error closing pool:", e);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", shutdown);

module.exports = {
  pool,
  getConnection,
  ping,
  config,
};
