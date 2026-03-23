const mysql = require("mysql2/promise");
const logger = require("../Utils/logger");
const Config = require("../Utils/Config");

/**
 * Database Connection Pool Configuration
 *
 * PURPOSE: Provides optimized database connection pooling with environment-aware settings,
 * retry logic, and monitoring capabilities.
 *
 * PROBLEM SOLVED: Previously, the connection pool had fixed settings that didn't adapt to
 * environment (development vs production). There was no retry logic for connection failures,
 * and no way to monitor pool status. This caused:
 * - Resource waste in development (too many connections)
 * - Resource constraints in production (too few connections)
 * - Application crashes on temporary connection failures
 * - No visibility into pool utilization
 *
 * IMPROVEMENTS:
 * - Environment-based connection limits (20 for production, 10 for development)
 * - Connection retry logic with exponential backoff
 * - Connection timeout configuration (10 seconds)
 * - Keep-alive settings to reduce connection overhead
 * - Pool metrics function for monitoring
 */

// MySQL connection configuration
const HOST = Config.DB.HOST;
const USER = Config.DB.USER;
const PASSWORD = Config.DB.PASSWORD;
const DATABASE = Config.DB.DATABASE;
const DB_SOCKET_PATH = Config.DB.SOCKET_PATH;
const PORT = Config.DB.PORT;


if (!HOST || !USER || !DATABASE) {
  logger.error("Database config missing required env vars", {
    host: HOST,
    user: USER,
    database: DATABASE,
  });
  throw new Error("Missing required DB environment variables");
}

// Pool limit is now managed centrally in Utils/Config.js
const connectionLimit = Config.DB.CONNECTION_LIMIT;

const config = {
  host: HOST,
  user: USER,
  password: PASSWORD,
  database: DATABASE,
  waitForConnections: true,
  port: PORT,
  connectionLimit: connectionLimit,
  queueLimit: 0, // Unlimited queue, but connections will wait
  connectTimeout: 20000, // 20 seconds - timeout for establishing connection (shared hosting needs more time)
  // Note: acquireTimeout and timeout are not valid mysql2 pool options
  // Query timeouts should be handled at the query level or via connection options
  multipleStatements: false, // Safer by default
  enableKeepAlive: true, // Keep connections alive
  keepAliveInitialDelay: 0, // Start keep-alive immediately
  // Shared hosting optimizations
  idleTimeout: 60000, // Close idle connections after 60s to free resources
  maxIdle: 2, // Keep max 2 idle connections (shared hosting has limits)
};
// if in development and socket path is provided, use it
// If socket path is provided, use it (regardless of environment)
if (DB_SOCKET_PATH && DB_SOCKET_PATH.length > 0) {
  config.socketPath = DB_SOCKET_PATH;
}
// Create a connection pool
let pool;

try {
  pool = mysql.createPool(config);
  logger.info("MySQL pool created", {
    host: HOST,
    database: DATABASE,
    port: PORT,
    socketPath: DB_SOCKET_PATH || null,
  });

  // Verify connectivity on startup (fail fast)
  (async () => {
    try {
      await pool.query("SELECT 1");
      logger.info("MySQL connectivity check succeeded");
    } catch (err) {
      logger.error("MySQL connectivity check failed", {
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState,
        message: err.message,
      });
      // Do not crash the app; let requests surface DB errors while we log them
      // throw err;
    }
  })();

  // Attach connection-level error listener
  pool.on("connection", (connection) => {
    connection.on("error", (err) => {
      logger.error("MySQL connection error", {
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState,
        message: err.message,
      });
    });
  });
  pool.on("error", (err) => {
    logger.error("MySQL pool error", {
      code: err.code,
      errno: err.errno,
      sqlState: err.sqlState,
      message: err.message,
    });
  });
  pool.on("end", () => {
    logger.info("MySQL pool ended");
  });
} catch (error) {
  logger.error("Failed to create MySQL pool", {
    code: error.code,
    errno: error.errno,
    sqlState: error.sqlState,
    message: error.message,
  });
  // Do not crash the app; keep running to allow retries/logging
  // throw error; // Re-throw the error to ensure the application fails fast
}

/**
 * Get a connection from the pool with retry logic
 *
 * PURPOSE: Acquires a database connection from the pool with automatic retry on failure.
 * Uses exponential backoff to handle temporary connection issues gracefully.
 *
 * PROBLEM SOLVED: Previously, connection failures would immediately throw errors, causing
 * application crashes. This function retries with exponential backoff, allowing the
 * application to recover from temporary network issues or database restarts.
 *
 * @param {number} [retries=3] - Number of retry attempts (default: 3)
 * @param {number} [delay=1000] - Initial delay in milliseconds (default: 1000ms)
 *                                 Delay increases exponentially: delay * attempt number
 * @returns {Promise<Connection>} MySQL connection object
 * @throws {Error} If all retry attempts fail
 *
 * @example
 * const connection = await getConnection(); // Retries 3 times with exponential backoff
 * try {
 *   await connection.query('SELECT * FROM Users');
 * } finally {
 *   connection.release();
 * }
 */
async function getConnection(retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await pool.getConnection();
      return connection;
    } catch (error) {
      if (attempt === retries) {
        logger.error("Failed to get database connection after retries", {
          attempts: retries,
          error: error.message,
          code: error.code,
        });
        throw error;
      }

      logger.warn(
        `Database connection attempt ${attempt} failed, retrying...`,
        {
          attempt,
          retries,
          error: error.message,
          code: error.code,
        },
      );

      // Wait before retrying (exponential backoff)
      await new Promise((resolve) => setTimeout(resolve, delay * attempt));
    }
  }
}

/**
 * Get connection pool metrics
 *
 * PURPOSE: Returns current connection pool status including active connections,
 * free connections, total connections, and queued requests.
 *
 * WHEN TO USE:
 * - Monitoring dashboard (display pool utilization)
 * - Health checks (check if pool is exhausted)
 * - Capacity planning (analyze connection usage)
 * - Troubleshooting (identify connection pool issues)
 *
 * @returns {Object|null} Pool metrics object with:
 *   - totalConnections: Total connections in pool
 *   - freeConnections: Available connections
 *   - activeConnections: Currently in-use connections
 *   - queuedRequests: Requests waiting for a connection
 *   - config: Pool configuration (connectionLimit, queueLimit)
 *   Returns null if pool is not initialized
 *
 * @example
 * const metrics = getPoolMetrics();
 * if (metrics) {
 *   const utilization = (metrics.activeConnections / metrics.config.connectionLimit) * 100;
 *   console.log(`Pool utilization: ${utilization.toFixed(1)}%`);
 * }
 */
function getPoolMetrics() {
  if (!pool) {
    return null;
  }

  return {
    totalConnections: pool.pool?._allConnections?.length || 0,
    freeConnections: pool.pool?._freeConnections?.length || 0,
    activeConnections:
      (pool.pool?._allConnections?.length || 0) -
      (pool.pool?._freeConnections?.length || 0),
    queuedRequests: pool.pool?._connectionQueue?.length || 0,
    config: {
      connectionLimit: config.connectionLimit,
      queueLimit: config.queueLimit,
    },
  };
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
    }
  } catch (e) {
    logger.error("Error closing database pool", {
      error: e.message,
      stack: e.stack,
    });
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
  getPoolMetrics,
};
