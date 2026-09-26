// express@5 handles async errors natively — no need for express-async-errors
const Config = require("./Utils/Config");

const logger = require("./Utils/logger");
const getLocalIpAddress = require("./Utils/MyIpAddress.js");
const ipAddress = getLocalIpAddress();
//import express server setup
const app = require("./Config/Express.config.js");
// import socket adapter
const { initSocket } = require("./Config/SocketAdapter.config.js");
const { createServer: createHTTPServer } = require("http");

// import process error handlers
const { setupProcessErrorHandlers } = require("./Config/ProcessErrorHandlers");

const FORCE_SHUTDOWN_TIMEOUT_MS = 10000;
const { currentDate } = require("./Utils/CurrentDate.js");

/**
 * PRODUCTION SAFETY CHECK (fail-closed)
 * =====================================
 * This server runs in one of two modes:
 *
 *   PRODUCTION  -> app.dynamicsroute.tech  (real users, real data)
 *   DEV/STAGING -> dev.dynamicsroute.tech  (test database, test OTP 101010,
 *                  SMS disabled, localhost:5173 allowed)
 *
 * The mode is chosen by NODE_ENV=production / anything else. But a few
 * variables are DESIGNED to work even on production and can turn the live
 * hub into a dev sandbox by accident. The most common mistake: copying a
 * development .env into the production Dokploy app.
 *
 * Before the server starts, THIS function refuses to boot in production if
 * any of those "dev-only" switches are set. That way a misconfigured prod
 * fails loudly at startup instead of silently accepting test OTPs or
 * localhost connections.
 *
 * The blocked switches (dev/staging only, never on production):
 *   1. USE_TEST_OTP=true        -> every login uses fixed OTP "101010"
 *   2. ENABLE_LOCAL_DEV_ORIGINS=true -> localhost/dev.* origins are allowed
 *   3. EXTRA_ALLOWED_ORIGINS that contain localhost / 127.0.0.1 / dev.*
 */
const assertProductionSafety = () => {
  if (Config.NODE_ENV !== "production") return;

  const violations = [];

  if (Config.USE_TEST_OTP) {
    violations.push(
      "USE_TEST_OTP=true (every login uses the fixed test OTP '101010')",
    );
  }

  if (process.env.ENABLE_LOCAL_DEV_ORIGINS === "true") {
    violations.push(
      "ENABLE_LOCAL_DEV_ORIGINS=true (localhost:5173/:3000 + dev.* origins allowed)",
    );
  }

  const extra = (process.env.EXTRA_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean);
  if (
    extra.some(
      (origin) =>
        origin.includes("localhost") ||
        origin.startsWith("http://127.0.0.1") ||
        origin.includes("dev.dynamicsroute.tech"),
    )
  ) {
    violations.push("EXTRA_ALLOWED_ORIGINS contains a dev/localhost origin");
  }

  if (violations.length > 0) {
    const friendly = violations.join("\n  - ");
    logger.error(
      "PRODUCTION SAFETY BLOCK: refusing to start with dev-stage settings",
      { violations },
    );
    throw new Error(
      "PRODUCTION SAFETY BLOCK\n" +
        "This app is running as NODE_ENV=production (app.dynamicsroute.tech), but it has dev/staging settings enabled.\n" +
        "Remove these from the deployed environment, then redeploy:\n  - " +
        friendly +
        "\nDEV/dokploy apps (dev.dynamicsroute.tech) may keep them.",
    );
  }
};

const onStartUp = async () => {
  try {
    // Initialize query performance monitoring
    const {
      initializeQueryMonitoring,
    } = require("./Middleware/QueryPerformance");
    initializeQueryMonitoring();

    // Start Automatic Timeout Detection Service
    // This service automatically detects when drivers don't respond within the timeout period
    // and processes the timeout automatically (updates status, creates new request, sends notifications)
    const {
      startAutomaticTimeoutService,
    } = require("./Services/DriverRequest/automaticTimeout.service");

    const timeoutServiceControl = startAutomaticTimeoutService({
      intervalSeconds: parseInt(Config.DRIVER_TIMEOUT_CHECK_INTERVAL, 10), // Default: check every 2 minutes
      runImmediately: true, // Run check immediately on startup
    });

    logger.info("Automatic Timeout Detection Service started", {
      intervalSeconds: parseInt(Config.DRIVER_TIMEOUT_CHECK_INTERVAL, 10),
      timeoutMinutes: parseInt(Config.DRIVER_RESPONSE_TIMEOUT_MINUTES, 10),
      timestamp: currentDate(),
    });

    // Store control object for graceful shutdown
    global.timeoutServiceControl = timeoutServiceControl;

    // Start Telegram bot polling (approve/reject via the alert buttons).
    // No-op when Telegram isn't configured or TELEGRAM_POLLING=false.
    try {
      const { startTelegramBotPolling } = require("./Utils/TelegramBotUpdates");
      global.telegramPollingControl = startTelegramBotPolling();
    } catch (pollingError) {
      logger.warn("Telegram bot polling startup failed", {
        message: pollingError.message,
      });
    }

    // Ensure the DeliveryConfirmations enforcement columns exist on a
    // pre-existing database (idempotent, information_schema-checked). CREATE
    // TABLE IF NOT EXISTS alone is a no-op on an old table, so missing columns
    // would break GET /deliveryConfirmations with ER_BAD_FIELD_ERROR.
    try {
      const {
        ensureDeliveryConfirmationColumns,
        ensureDeliveryConfirmationPhotoAttachedBy,
        ensureDriverQueueStatusJourneyMapInt,
      } = require("./Services/Database/tableManage.service");
      const { pool } = require("./Middleware/Database.config");
      await ensureDeliveryConfirmationColumns(pool);
      await ensureDeliveryConfirmationPhotoAttachedBy(pool);
      await ensureDriverQueueStatusJourneyMapInt(pool);
      logger.info("DeliveryConfirmations schema migration ensured");
    } catch (migrationError) {
      logger.warn("DeliveryConfirmations schema migration failed", {
        error: migrationError.message,
      });
    }

    // Add your startup logic here (e.g., DB connection)
    // createTable();
  } catch (error) {
    logger.error("Startup Error", error);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    // Fail fast in production if dev-stage settings are present.
    assertProductionSafety();
    // Create HTTP server
    const httpServer = createHTTPServer(app);

    initSocket({ httpServer }); // Initialize Socket.IO

    const PORT = Config.PORT;
    const server = httpServer?.listen(PORT, "0.0.0.0", () => {
      logger.info(`Server running at:`);
      logger.info(`   Local:   http://localhost:${PORT}`);
      logger.info(`   Network: http://${ipAddress}:${PORT}`);
      logger.info(`   Env:     ${Config.NODE_ENV}`);
      logger.info(`Server is running on http://${ipAddress}:${PORT}`, {
        port: PORT,
        nodeEnv: Config.NODE_ENV,
        pid: process.pid,
      });
      onStartUp();
    });

    // Setup process-level error handlers (unhandled rejections, uncaught exceptions)
    setupProcessErrorHandlers({ server });

    // Graceful shutdown - stop automatic timeout service on shutdown
    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}, shutting down gracefully...`);

      // Stop automatic timeout service if it's running
      if (global.timeoutServiceControl) {
        global.timeoutServiceControl.stop();
      }
      // Stop Telegram bot polling if it's running
      if (global.telegramPollingControl) {
        global.telegramPollingControl.stop();
      }

      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, FORCE_SHUTDOWN_TIMEOUT_MS);
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    logger.error("Failed to start server", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    });
    console.error("Server startup error:", error);
    process.exit(1);
  }
};

startServer().catch((error) => {
  logger.error("Unhandled error in startServer", {
    message: error.message,
    stack: error.stack,
    name: error.name,
  });
  console.error("Unhandled error:", error);
  process.exit(1);
});
