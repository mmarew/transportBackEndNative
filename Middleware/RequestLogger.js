const logger = require("../Utils/logger");
const { currentDate } = require("../Utils/CurrentDate");

const SLOW_REQUEST_THRESHOLD_MS = 1000;

/**
 * RequestLogger Middleware
 *
 * PURPOSE: Provides comprehensive monitoring of every incoming HTTP request.
 *
 * FEATURES:
 * - Logs request initiation (Method, URL, IP, User-Agent).
 * - Calculates and logs total Response Time.
 * - Automatically flags "Slow Requests" that exceed a 1000ms threshold.
 * - Captures and logs response-level errors with stack traces.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const requestLogger = (req, res, next) => {
  const startTime = currentDate();

  // Log request start
  logger.debug("Request Started", {
    type: "REQUEST_START",
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.get("user-agent"),
    userId: req.user?.userId,
  });

  // Capture response finish
  res.on("finish", () => {
    const responseTime = currentDate() - startTime;

    // Log the completed request
    logger.application.apiRequest(req, res, responseTime);

    // Any >=400 response that wasn't routed through the global error handler
    // (e.g. a direct res.status(...).json(...)) must still reach the error log
    // so backend errors are captured in one place.
    if (
      res.statusCode >= 400 &&
      !res.locals.apiErrorLogged
    ) {
      logger.error("Client Error", {
        type: "CLIENT_ERROR",
        message: `HTTP ${res.statusCode}`,
        statusCode: res.statusCode,
        path: req.originalUrl,
        method: req.method,
        ip: req.ip,
        requestId: req.requestId,
        userId: req.user?.userId,
        userUniqueId: req.user?.userUniqueId,
      });
    }

    // Log slow requests
    if (responseTime > SLOW_REQUEST_THRESHOLD_MS) {
      logger.warn("Slow Request", {
        type: "SLOW_REQUEST",
        method: req.method,
        url: req.originalUrl,
        responseTime: `${responseTime}ms`,
        threshold: "1000ms",
      });
    }
  });

  // Capture response errors
  res.on("error", (error) => {
    logger.error("Response Error", {
      type: "RESPONSE_ERROR",
      method: req.method,
      url: req.originalUrl,
      error: error.message,
      stack: error.stack,
    });
  });

  next();
};

module.exports = requestLogger;
