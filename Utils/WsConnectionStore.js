const { redis } = require("../Config/redis.config");
const logger = require("./logger");

const redisClient = redis;

// In-memory fallback store for when Redis is unavailable (single-server / test mode)
const inMemoryStore = new Map();

// Socket keys get a 24h TTL so stale ":phone" rows self-expire instead of
// growing forever. Without it every notification fan-out re-fetches dead keys
// and the Upstash keyspace balloons, burning the daily request quota.
// eslint-disable-next-line no-magic-numbers
const SOCKET_KEY_TTL_SECONDS = 24 * 60 * 60;

// Operator kill-switch: on a single server the in-memory map is authoritative.
// Set DISABLE_SOCKET_REDIS=1 to stop paying Upstash for the redundant copy
// (e.g. while raising the request quota on the Upstash console).
const persistToRedis = process.env.DISABLE_SOCKET_REDIS !== "1";

const getAllSockets = async () => {
  const sockets = [];

  // Collect from in-memory store
  for (const [key, socketId] of inMemoryStore) {
    sockets.push({ key, socketId });
  }

  // Collect from Redis if available
  if (persistToRedis && redisClient && redisClient.status === "ready") {
    try {
      const stream = redisClient.scanStream({
        match: "*:*",
        count: 100,
      });

      try {
        for await (const keys of stream) {
          for (const key of keys) {
            try {
              const socketId = await redisClient.get(key);
              sockets.push({ key, socketId });
            } catch (getError) {
              logger.debug("Error getting socket from Redis", {
                key,
                error: getError.message,
              });
            }
          }
        }
      } catch (streamError) {
        logger.warn("Redis stream error", {
          error: streamError.message,
          stack: streamError.stack,
        });
      }
    } catch (error) {
      logger.error("Redis connection error in getAllSockets", {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  return sockets.length > 0 ? sockets : null;
};

const setSocket = async (userType, identifier, socketId) => {
  const key = `${userType}:${identifier}`;

  // Always store in memory as fallback
  inMemoryStore.set(key, socketId);

  // Also try Redis if available
  if (persistToRedis && redisClient && redisClient.status === "ready") {
    try {
      await redisClient.set(key, socketId, "EX", SOCKET_KEY_TTL_SECONDS);
      return;
    } catch (error) {
      logger.error("Error setting socket in Redis", {
        userType,
        identifier,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  return null;
};

const getSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;

  // Check in-memory store first (fast path for single-server / test mode)
  const memorySocketId = inMemoryStore.get(key);
  if (memorySocketId) {
    return memorySocketId;
  }

  // Fall back to Redis
  if (persistToRedis && redisClient && redisClient.status === "ready") {
    try {
      const redisSocket = await redisClient.get(key);
      return redisSocket;
    } catch (error) {
      logger.error("Error getting socket from Redis", {
        userType,
        identifier,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  return null;
};

const removeSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;

  // Remove from in-memory store
  inMemoryStore.delete(key);

  // Also remove from Redis if available
  if (persistToRedis && redisClient && redisClient.status === "ready") {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error("Error removing socket from Redis", {
        userType,
        identifier,
        error: error.message,
        stack: error.stack,
      });
    }
  }
};

module.exports = { getAllSockets, setSocket, getSocket, removeSocket };
