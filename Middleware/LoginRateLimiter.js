const rateLimit = require("express-rate-limit");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { HTTP_STATUS } = require("../Utils/Constants");

/**
 * Enhanced Rate Limiter for Login and OTP
 * Protects against brute-force attacks on sensitive endpoints.
 */
const loginRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || 15 * 60 * 1000; // 15 minutes
  const max = options.limit || 10; // Limit each IP/Phone combo to 10 requests per window

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    keyGenerator: (req) => {
      // Use combination of IP and phone number for more specific limiting
      const ip = req.ip || req.connection?.remoteAddress || "unknown";
      const phone = req.body?.phoneNumber || req.query?.phoneNumber || "no-phone";
      return `${ip}_${phone}`;
    },
    handler: (req, res, next, options) => {
      logger.warn("Rate limit exceeded", {
        ip: req.ip,
        phone: req.body?.phoneNumber,
        path: req.originalUrl,
      });
      next(new AppError(options.message, options.statusCode));
    },
    message: "Too many attempts, please try again after 15 minutes.",
    statusCode: HTTP_STATUS.TOO_MANY_REQUESTS,
  });
};

module.exports = loginRateLimiter;
