const { redis } = require("../Config/redis.config");
const logger = require("./logger");

const redisClient = redis;

// In-memory fallback store for when Redis is unavailable (single-server / test mode)
const inMemoryStore = new Map();

const getAllSockets = async () => {
  const sockets = [];

  // Collect from in-memory store
  for (const [key, socketId] of inMemoryStore) {
    sockets.push({ key, socketId });
  }

  // Collect from Redis if available
  if (redisClient && redisClient.status === "ready") {
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
  if (redisClient && redisClient.status === "ready") {
    try {
      await redisClient.set(key, socketId);
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
  if (redisClient && redisClient.status === "ready") {
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
  if (redisClient && redisClient.status === "ready") {
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
