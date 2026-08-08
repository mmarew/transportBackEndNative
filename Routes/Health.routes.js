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
const { clearCache } = require("../Services/FixedData.service");
const { HTTP_STATUS } = require("../Utils/Constants");

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

    const statusCode = db === "up" ? HTTP_STATUS.OK : HTTP_STATUS.SERVICE_UNAVAILABLE;
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
        ? HTTP_STATUS.OK
        : health.status === "degraded"
          ? HTTP_STATUS.OK
          : HTTP_STATUS.SERVICE_UNAVAILABLE;
    res.status(statusCode).json(health);
  } catch {
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
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

    res.status(HTTP_STATUS.OK).json({
      message: "success",
      data: {
        pool: poolMetrics,
        queries: queryStats,
        server: stats.server,
        tables: stats.tables,
      },
    });
  } catch {
    next(new AppError("Failed to retrieve database statistics", AppError.INTERNAL_SERVER_ERROR));
  }
});

// Clear FixedData cache (useful for test suites)
router.get("/api/utils/clear-cache", async (req, res) => {
  clearCache();
  res.json({ message: "success", data: "FixedData cache cleared" });
});

module.exports = router;
