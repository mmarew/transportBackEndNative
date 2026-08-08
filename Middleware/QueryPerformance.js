const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { currentDate } = require("../Utils/CurrentDate");
const Config = require("../Utils/Config");

// Configuration
const SLOW_QUERY_THRESHOLD = Config.DB.SLOW_QUERY_THRESHOLD; // milliseconds
const ENABLE_QUERY_LOGGING = Config.DB.ENABLE_QUERY_LOGGING;

// Logging metrics configuration
const SLOW_QUERY_SQL_TRUNCATE_LENGTH = 500;
const DEBUG_QUERY_SQL_TRUNCATE_LENGTH = 200;
const SLOW_QUERY_LOG_CAP = 100;
const PERCENTAGE_DECIMAL_PLACES = 2;

// Query performance statistics
const queryStats = {
  totalQueries: 0,
  slowQueries: 0,
  totalExecutionTime: 0,
  queriesByTable: new Map(),
  slowQueriesList: [],
};

/**
 * Wrap pool.query to add performance monitoring
 *
 * PURPOSE: Intercepts all database queries to automatically track execution time and identify slow queries.
 * This provides visibility into query performance without requiring code changes in services.
 *
 * PROBLEM SOLVED: Slow database queries were going undetected, making it difficult to identify
 * performance bottlenecks. There was no visibility into:
 * - Which queries were slow
 * - Which tables were causing performance issues
 * - Average query execution times
 * - Query performance trends
 *
 * This function wraps the pool.query method to automatically track all queries.
 */
const wrapPoolQuery = () => {
  const originalQuery = pool.query.bind(pool);

  pool.query = async function (sql, params) {
    const startTime = currentDate();
    queryStats.totalQueries++;

    const sqlText =
      typeof sql === "string"
        ? sql
        : sql && typeof sql === "object" && typeof sql.sql === "string"
          ? sql.sql
          : "";

    try {
      const result = await originalQuery(sql, params);
      const executionTime = currentDate() - startTime;
      queryStats.totalExecutionTime += executionTime;

      // Extract table name from SQL (simple regex)
      const tableMatch = sqlText.match(
        /FROM\s+`?(\w+)`?|UPDATE\s+`?(\w+)`?|INSERT\s+INTO\s+`?(\w+)`?|DELETE\s+FROM\s+`?(\w+)`?/i,
      );
      const tableName = tableMatch
        ? tableMatch[1] || tableMatch[2] || tableMatch[3] || tableMatch[4]
        : "unknown";

      // Update table statistics
      if (!queryStats.queriesByTable.has(tableName)) {
        queryStats.queriesByTable.set(tableName, {
          count: 0,
          totalTime: 0,
          slowQueries: 0,
        });
      }
      const tableStats = queryStats.queriesByTable.get(tableName);
      tableStats.count++;
      tableStats.totalTime += executionTime;

      // Log slow queries
      if (executionTime > SLOW_QUERY_THRESHOLD) {
        queryStats.slowQueries++;
        tableStats.slowQueries++;

        const slowQueryInfo = {
          executionTime: `${executionTime}ms`,
          sql:
            sqlText.length > SLOW_QUERY_SQL_TRUNCATE_LENGTH ? sqlText.substring(0, SLOW_QUERY_SQL_TRUNCATE_LENGTH) + "..." : sqlText,
          params: params
            ? Array.isArray(params)
              ? params.length
              : Object.keys(params).length
            : 0,
          table: tableName,
          timestamp: currentDate(),
        };

        queryStats.slowQueriesList.push(slowQueryInfo);

        // Keep only last 100 slow queries
        if (queryStats.slowQueriesList.length > SLOW_QUERY_LOG_CAP) {
          queryStats.slowQueriesList.shift();
        }

        logger.warn("Slow query detected", slowQueryInfo);

        // Log full query details at debug level
        if (ENABLE_QUERY_LOGGING) {
          logger.debug("Slow query details", {
            fullSql: sqlText,
            params: params,
            executionTime: `${executionTime}ms`,
            table: tableName,
          });
        }
      }

      // Log all queries at debug level if enabled
      if (ENABLE_QUERY_LOGGING) {
        logger.debug("Database query executed", {
          executionTime: `${executionTime}ms`,
          table: tableName,
          sql:
            sqlText.length > DEBUG_QUERY_SQL_TRUNCATE_LENGTH ? sqlText.substring(0, DEBUG_QUERY_SQL_TRUNCATE_LENGTH) + "..." : sqlText,
        });
      }

      return result;
    } catch (error) {
      const executionTime = currentDate() - startTime;
      logger.error("Database query error", {
        executionTime: `${executionTime}ms`,
        error: error.message,
        code: error.code,
        sql: sqlText.length > SLOW_QUERY_SQL_TRUNCATE_LENGTH ? sqlText.substring(0, SLOW_QUERY_SQL_TRUNCATE_LENGTH) + "..." : sqlText,
      });
      throw error;
    }
  };
};

/**
 * Initialize query performance monitoring
 *
 * PURPOSE: Sets up automatic query performance monitoring for all database queries.
 * This should be called once during application startup (already done in App.js).
 *
 * WHAT IT DOES:
 * - Wraps pool.query() to intercept all queries
 * - Tracks execution time for every query
 * - Logs slow queries (exceeding SLOW_QUERY_THRESHOLD)
 * - Maintains statistics per table
 * - Keeps history of recent slow queries
 *
 * WHEN TO USE:
 * - Application startup (call once when server starts)
 * - Already initialized in App.js, no need to call manually
 *
 * Configuration via environment variables:
 * - SLOW_QUERY_THRESHOLD: Milliseconds threshold for slow queries (default: 100ms)
 * - ENABLE_QUERY_LOGGING: Enable detailed query logging (default: true)
 */
const initializeQueryMonitoring = () => {
  wrapPoolQuery();
  logger.info("Query performance monitoring initialized", {
    slowQueryThreshold: `${SLOW_QUERY_THRESHOLD}ms`,
    queryLoggingEnabled: ENABLE_QUERY_LOGGING,
  });
};

/**
 * Get query performance statistics
 *
 * PURPOSE: Returns comprehensive query performance statistics including total queries,
 * slow queries, average execution times, and per-table statistics.
 *
 * WHEN TO USE:
 * - Performance analysis (identify which queries/tables are slow)
 * - Monitoring dashboard (display query performance metrics)
 * - Optimization efforts (focus on slow queries)
 * - Debugging (investigate performance issues)
 *
 * @returns {Object} Statistics object with:
 *   - totalQueries: Total number of queries executed
 *   - slowQueries: Number of queries exceeding threshold
 *   - slowQueryPercentage: Percentage of queries that are slow
 *   - avgExecutionTime: Average query execution time in milliseconds
 *   - totalExecutionTime: Total time spent on all queries
 *   - tableStats: Per-table statistics (count, avgTime, slowQueries)
 *   - recentSlowQueries: Array of last 10 slow queries with details
 *
 * @example
 * const stats = getQueryStats();
 * console.log(`Total queries: ${stats.totalQueries}`);
 * console.log(`Slow queries: ${stats.slowQueries} (${stats.slowQueryPercentage}%)`);
 * console.log(`Average time: ${stats.avgExecutionTime}ms`);
 *
 * // Check which tables are slow
 * Object.entries(stats.tableStats).forEach(([table, stats]) => {
 *   if (stats.avgTime > 100) {
 *     console.log(`${table} is slow: ${stats.avgTime}ms average`);
 *   }
 * });
 */
const getQueryStats = () => {
  const avgExecutionTime =
    queryStats.totalQueries > 0
      ? queryStats.totalExecutionTime / queryStats.totalQueries
      : 0;

  const slowQueryPercentage =
    queryStats.totalQueries > 0
      ? (queryStats.slowQueries / queryStats.totalQueries) * 100
      : 0;

  const tableStats = {};
  queryStats.queriesByTable.forEach((stats, tableName) => {
    tableStats[tableName] = {
      count: stats.count,
      avgTime: stats.count > 0 ? stats.totalTime / stats.count : 0,
      slowQueries: stats.slowQueries,
    };
  });

  return {
    totalQueries: queryStats.totalQueries,
    slowQueries: queryStats.slowQueries,
    slowQueryPercentage: slowQueryPercentage.toFixed(PERCENTAGE_DECIMAL_PLACES),
    avgExecutionTime: avgExecutionTime.toFixed(PERCENTAGE_DECIMAL_PLACES),
    totalExecutionTime: queryStats.totalExecutionTime,
    tableStats,
    recentSlowQueries: queryStats.slowQueriesList.slice(-10), // Last 10 slow queries
  };
};

/**
 * Reset query statistics
 *
 * PURPOSE: Clears all accumulated query statistics. Useful for resetting metrics
 * after deploying optimizations or starting a new monitoring period.
 *
 * WHEN TO USE:
 * - After deploying query optimizations (reset to measure improvement)
 * - Starting a new monitoring period (daily/weekly resets)
 * - Testing performance improvements (reset before/after changes)
 *
 * @example
 * // Before optimization
 * const beforeStats = getQueryStats();
 *
 * // Deploy optimization
 * // ...
 *
 * // Reset and measure improvement
 * resetQueryStats();
 * // ... run queries ...
 * const afterStats = getQueryStats();
 * console.log(`Improvement: ${beforeStats.avgExecutionTime - afterStats.avgExecutionTime}ms`);
 */
const resetQueryStats = () => {
  queryStats.totalQueries = 0;
  queryStats.slowQueries = 0;
  queryStats.totalExecutionTime = 0;
  queryStats.queriesByTable.clear();
  queryStats.slowQueriesList = [];
  logger.info("Query statistics reset");
};

module.exports = {
  initializeQueryMonitoring,
  getQueryStats,
  resetQueryStats,
  SLOW_QUERY_THRESHOLD,
};
