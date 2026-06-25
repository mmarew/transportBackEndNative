const { pool, getPoolMetrics, ping } = require("../Middleware/Database.config");
const { currentDate } = require("./CurrentDate");
const logger = require("./logger");

/**
 * Database Health Monitoring Utility
 *
 * PURPOSE: Provides comprehensive health monitoring for database connectivity and connection pool.
 * Enables proactive detection of database issues before they impact users.
 *
 * PROBLEM SOLVED: Previously, there was no way to monitor database health, connection pool status,
 * or proactively detect database issues. This made troubleshooting difficult and prevented early
 * detection of problems like:
 * - Connection pool exhaustion
 * - Database server connectivity issues
 * - Query execution failures
 * - Resource constraints
 */

/**
 * Perform a comprehensive database health check
 *
 * PURPOSE: Checks multiple aspects of database health in a single call:
 * 1. Basic connectivity (ping test)
 * 2. Connection pool status (utilization, active/free connections)
 * 3. Query execution capability
 * 4. Database server status
 *
 * WHEN TO USE:
 * - Health check endpoints (expose /api/health/database for monitoring tools)
 * - Proactive monitoring (detect issues before they affect users)
 * - Troubleshooting (get detailed metrics when investigating issues)
 * - Capacity planning (monitor connection pool utilization)
 *
 * @param {Object} [options] - Health check options
 * @param {number} [options.timeout=5000] - Health check timeout in milliseconds (default: 5 seconds)
 * @returns {Promise<Object>} Health check result with:
 *   - status: "healthy" | "degraded" | "unhealthy"
 *   - timestamp: ISO timestamp of check
 *   - checks: Object with individual check results (connectivity, pool, queryExecution, serverStatus)
 *   - metrics: Connection pool metrics (if available)
 *   - responseTime: Total time taken for health check
 *
 * @example
 * const health = await checkDatabaseHealth();
 * if (health.status === 'unhealthy') {
 *   // Alert operations team
 *   sendAlert('Database is unhealthy!');
 * }
 * console.log(`Pool utilization: ${health.checks.pool.utilization}`);
 */
const checkDatabaseHealth = async (options = {}) => {
  const { timeout = 5000 } = options;
  const startTime = currentDate();

  const health = {
    status: "unknown",
    timestamp: currentDate(),
    checks: {},
    metrics: null,
    responseTime: null,
  };

  try {
    // Check 1: Basic connectivity (ping)
    try {
      const pingStart = currentDate();
      await Promise.race([
        ping(),
        new Promise((resolve, reject) =>
          setTimeout(() => reject(new Error("Ping timeout")), timeout),
        ),
      ]);
      const pingTime = currentDate() - pingStart;

      health.checks.connectivity = {
        status: "healthy",
        responseTime: `${pingTime}ms`,
      };
    } catch (error) {
      health.checks.connectivity = {
        status: "unhealthy",
        error: error.message,
      };
      health.status = "unhealthy";
      health.responseTime = currentDate() - startTime;
      return health;
    }

    // Check 2: Connection pool metrics
    try {
      const poolMetrics = getPoolMetrics();
      if (poolMetrics) {
        health.metrics = poolMetrics;

        const poolUtilization =
          poolMetrics.config.connectionLimit > 0
            ? (poolMetrics.activeConnections /
                poolMetrics.config.connectionLimit) *
              100
            : 0;

        health.checks.pool = {
          status: poolUtilization > 90 ? "warning" : "healthy",
          utilization: `${poolUtilization.toFixed(1)}%`,
          activeConnections: poolMetrics.activeConnections,
          freeConnections: poolMetrics.freeConnections,
          totalConnections: poolMetrics.totalConnections,
          queuedRequests: poolMetrics.queuedRequests,
        };

        if (poolUtilization > 90) {
          health.status = "degraded";
        }
      } else {
        health.checks.pool = {
          status: "unknown",
          error: "Pool metrics not available",
        };
      }
    } catch (error) {
      health.checks.pool = {
        status: "error",
        error: error.message,
      };
    }

    // Check 3: Query execution test
    try {
      const queryStart = currentDate();
      await Promise.race([
        pool.query("SELECT 1 as health_check"),
        new Promise((resolve, reject) =>
          setTimeout(() => reject(new Error("Query timeout")), timeout),
        ),
      ]);
      const queryTime = currentDate() - queryStart;

      health.checks.queryExecution = {
        status: "healthy",
        responseTime: `${queryTime}ms`,
      };
    } catch (error) {
      health.checks.queryExecution = {
        status: "unhealthy",
        error: error.message,
      };
      health.status = "unhealthy";
    }

    // Check 4: Database server status
    try {
      const [serverStatus] = await pool.query(
        "SHOW STATUS LIKE 'Threads_connected'",
      );
      if (serverStatus && serverStatus.length > 0) {
        health.checks.serverStatus = {
          status: "healthy",
          threadsConnected: serverStatus[0].Value,
        };
      }
    } catch (error) {
      health.checks.serverStatus = {
        status: "error",
        error: error.message,
      };
    }

    // Determine overall status
    if (health.status === "unknown") {
      const allHealthy = Object.values(health.checks).every(
        (check) => check.status === "healthy" || check.status === "warning",
      );
      health.status = allHealthy ? "healthy" : "degraded";
    }

    health.responseTime = currentDate() - startTime;
    return health;
  } catch (error) {
    logger.error("Database health check failed", {
      error: error.message,
      stack: error.stack,
    });

    health.status = "unhealthy";
    health.error = error.message;
    health.responseTime = currentDate() - startTime;
    return health;
  }
};

/**
 * Get detailed database statistics
 *
 * PURPOSE: Retrieves comprehensive database statistics including connection pool metrics,
 * server configuration, and table statistics. Useful for monitoring and capacity planning.
 *
 * WHEN TO USE:
 * - Monitoring dashboard (display real-time database metrics)
 * - Capacity planning (analyze resource usage trends)
 * - Performance analysis (identify large tables that may need optimization)
 * - Troubleshooting (get detailed metrics when investigating issues)
 *
 * @returns {Promise<Object>} Database statistics object with:
 *   - pool: Connection pool metrics (active, free, total connections, queued requests)
 *   - server: Server configuration (max_connections, etc.)
 *   - tables: Top 10 largest tables by size (table_name, rows, data_length, index_length)
 *
 * @example
 * const stats = await getDatabaseStats();
 * console.log(`Active connections: ${stats.pool.activeConnections}`);
 * console.log(`Largest table: ${stats.tables[0]?.table_name}`);
 */
const getDatabaseStats = async () => {
  try {
    const stats = {
      pool: getPoolMetrics(),
      server: {},
      tables: {},
    };

    // Get server variables
    try {
      const [variables] = await pool.query(
        "SHOW VARIABLES LIKE 'max_connections'",
      );
      if (variables && variables.length > 0) {
        stats.server.maxConnections = variables[0].Value;
      }
    } catch (error) {
      logger.warn("Failed to get server variables", { error: error.message });
    }

    // Get table statistics
    try {
      const [tables] = await pool.query(`
        SELECT 
          table_name,
          table_rows,
          data_length,
          index_length,
          (data_length + index_length) as total_size
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        ORDER BY total_size DESC
        LIMIT 10
      `);
      stats.tables = tables;
    } catch (error) {
      logger.warn("Failed to get table statistics", { error: error.message });
    }

    return stats;
  } catch (error) {
    logger.error("Failed to get database statistics", {
      error: error.message,
    });
    throw error;
  }
};

/**
 * Monitor database health continuously
 *
 * PURPOSE: Starts continuous health monitoring that periodically checks database health
 * and calls a callback with the results. Useful for alerting and logging.
 *
 * WHEN TO USE:
 * - Background monitoring (continuously monitor database health)
 * - Alerting systems (call callback to trigger alerts on health issues)
 * - Logging (log health status periodically)
 * - Dashboard updates (update monitoring dashboard with latest health)
 *
 * @param {Function} callback - Callback function called with health status object on each check.
 *                              Receives the same object structure as checkDatabaseHealth().
 * @param {number} interval - Monitoring interval in milliseconds (default: 60000 = 1 minute)
 * @returns {Function} Function to stop monitoring. Call this function to stop the monitoring loop.
 *
 * @example
 * const stopMonitoring = startHealthMonitoring((health) => {
 *   if (health.status === 'unhealthy') {
 *     sendAlert('Database is unhealthy!', health);
 *   }
 *   logger.info('Database health check', health);
 * }, 60000); // Check every minute
 *
 * // Later, stop monitoring
 * stopMonitoring();
 */
const startHealthMonitoring = (callback, interval = 60000) => {
  let monitoring = true;

  const monitor = async () => {
    while (monitoring) {
      try {
        const health = await checkDatabaseHealth();
        if (callback) {
          callback(health);
        }

        // Log health status
        if (health.status === "unhealthy") {
          logger.error("Database health check failed", health);
        } else if (health.status === "degraded") {
          logger.warn("Database health degraded", health);
        }
      } catch (error) {
        logger.error("Health monitoring error", {
          error: error.message,
        });
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  };

  monitor();

  // Return stop function
  return () => {
    monitoring = false;
    logger.info("Database health monitoring stopped");
  };
};

module.exports = {
  checkDatabaseHealth,
  getDatabaseStats,
  startHealthMonitoring,
};
