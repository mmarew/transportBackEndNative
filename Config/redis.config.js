// redis config
const { UPSTASH_REDIS_URL } = require("../Utils/Constants");
const Redis = require("ioredis");

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

    // Handle Redis connection errors - CRITICAL: prevent unhandled rejections.
    // Logging intentionally omitted: Redis unavailability is expected during
    // local E2E runs and would otherwise drown the error log with noise.
    redis.on("error", () => {
      // Don't throw - let the app continue without Redis
      // This prevents unhandled rejections
    });

    redis.on("close", () => {});

    redis.on("reconnecting", () => {});

    redis.on("connect", () => {});

    redis.on("ready", () => {});

    redis.on("end", () => {});
  } catch {
    // Silently continue without Redis
    redis = null;
  }
} else {
  // UPSTASH_REDIS_URL not configured - Redis client not initialized
}

module.exports = { redis };
