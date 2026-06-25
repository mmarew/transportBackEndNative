// redis config
const { UPSTASH_REDIS_URL } = require("../Utils/Constants");
const Redis = require("ioredis");
const logger = require("../Utils/logger");

let redis = null;

// Only create Redis client if UPSTASH_REDIS_URL is configured
if (UPSTASH_REDIS_URL) {
  try {
    const redisOptions = {
      tls: {},
      connectTimeout: 10000, // 10s timeout
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: null, // Set to null to prevent MaxRetriesPerRequestError
      enableReadyCheck: true,
      enableOfflineQueue: false, // Don't queue commands when disconnected
    };

    if (process.env.REDIS_PASSWORD) {
      redisOptions.password = process.env.REDIS_PASSWORD;
    }

    redis = new Redis(UPSTASH_REDIS_URL, redisOptions);

    // Handle Redis connection errors - CRITICAL: prevent unhandled rejections
    redis.on("error", (err) => {
      logger.error("Redis Client Error", {
        error: err.message,
        code: err.code,
        name: err.name,
        stack: err.stack,
      });
      // Don't throw - let the app continue without Redis
      // This prevents unhandled rejections
    });

    // Handle MaxRetriesPerRequestError specifically
    redis.on("close", () => {
      logger.warn("Redis Client Connection Closed");
    });

    redis.on("reconnecting", (time) => {
      logger.info(`Redis Client Reconnecting in ${time}ms`);
    });

    redis.on("connect", () => {
      logger.info("Redis Client Connected");
    });

    redis.on("ready", () => {
      logger.info("Redis Client Ready");
    });

    // Catch any unhandled promise rejections from Redis operations
    redis.on("end", () => {
      logger.warn("Redis Client Connection Ended");
    });
  } catch (error) {
    logger.error("Failed to initialize Redis client", {
      error: error.message,
      code: error.code,
      name: error.name,
      stack: error.stack,
    });
    // Set redis to null so the app can continue without Redis
    redis = null;
  }
} else {
  logger.warn("UPSTASH_REDIS_URL not configured - Redis client not initialized");
}

module.exports = { redis };
