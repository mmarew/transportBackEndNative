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
const { currentDate } = require("./Utils/CurrentDate.js");

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

    // Add your startup logic here (e.g., DB connection)
    // createTable();
  } catch (error) {
    logger.error("Startup Error", error);
    process.exit(1);
  }
};

const startServer = async () => {
  try {
    // Create HTTP server
    const httpServer = createHTTPServer(app);

    initSocket({ httpServer }); // Initialize Socket.IO

    const PORT = Config.PORT;
    const server = httpServer?.listen(PORT, "0.0.0.0", () => {
      console.log(`\n🚀 Server running at:`);
      console.log(`   Local:   http://localhost:${PORT}`);
      console.log(`   Network: http://${ipAddress}:${PORT}`);
      console.log(`   Env:     ${Config.NODE_ENV}\n`);
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

      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10000);
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
