const express = require("express");
const router = express.Router();
const { ping, getPoolMetrics } = require("../Middleware/Database.config");
const {
  checkDatabaseHealth,
  getDatabaseStats,
} = require("../Utils/DatabaseHealth");
const { getQueryStats } = require("../Middleware/QueryPerformance");
const AppError = require("../Utils/AppError");
const { currentDate } = require("../Utils/CurrentDate");
const { HEALTH_ENDPOINTS } = require("./EndPoints/health.endpoints");

// Simple health check with DB reachability indicator
router.get(HEALTH_ENDPOINTS.HEALTH_CHECK, async (req, res, next) => {
  try {
    const startedAt = currentDate();
    let db = "up";
    try {
      await ping();
    } catch {
      db = "down";
    }

    const statusCode = db === "up" ? 200 : 503;
    return res.status(statusCode).json({
      message: "success",
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      db,
      responseTimeMs: currentDate() - startedAt,
      timestamp: currentDate(),
    });
  } catch (error) {
    next(error);
  }
});

// Enhanced database health check endpoint
router.get(HEALTH_ENDPOINTS.DATABASE_HEALTH, async (req, res) => {
  try {
    const health = await checkDatabaseHealth();
    const statusCode =
      health.status === "healthy"
        ? 200
        : health.status === "degraded"
          ? 200
          : 503;
    res.status(statusCode).json(health);
  } catch {
    res.status(500).json({
      message: "error",
      error: "Health check failed",
    });
  }
});

// Database statistics endpoint
router.get(HEALTH_ENDPOINTS.DATABASE_STATS, async (req, res, next) => {
  try {
    const stats = await getDatabaseStats();
    const queryStats = getQueryStats();
    const poolMetrics = getPoolMetrics();

    res.status(200).json({
      message: "success",
      data: {
        pool: poolMetrics,
        queries: queryStats,
        server: stats.server,
        tables: stats.tables,
      },
    });
  } catch {
    next(new AppError("Failed to retrieve database statistics", 500));
  }
});

module.exports = router;
