const { redis } = require("../Config/redis.config");

// Connect using the same Redis socket path
const redisClient = redis;
// for testing purposes only
const getAllSockets = async () => {
  // SCAN all keys matching the pattern (e.g., "user:*" or "admin:*")
  const stream = redisClient.scanStream({
    match: "*:*", // Adjust pattern if needed (e.g., "user:*")
    count: 100, // Batch size
  });

  const sockets = [];
  for await (const keys of stream) {
    for (const key of keys) {
      const socketId = await redisClient.get(key);
      sockets.push({ key, socketId });
    }
  }
  console.log("Available sockets", sockets);
  return sockets;
};

redisClient.on("error", (err) => {
  console.error("Redis connection error:", err);
});

const setSocket = async (userType, identifier, socketId) => {
  const key = `${userType}:${identifier}`;

  await redisClient.set(key, socketId);
  console.log(
    "@setSocket redisClient",
    redisClient.status,
    "key",
    key,
    "socketId",
    socketId
  );
};

const getSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;
  console.log("@getSocket redisClient", redisClient.status);
  return await redisClient.get(key);
};

const removeSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;
  await redisClient.del(key);
  console.log("@removeSocket redisClient", redisClient.status, "key", key);
};

module.exports = { getAllSockets, setSocket, getSocket, removeSocket };
