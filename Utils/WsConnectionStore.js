// Utils/WsConnectionStore.js
const { createClient } = require("redis");

const redisClient = createClient({
  socket: {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: process.env.REDIS_PORT || 6379,
  },
});

redisClient.connect();

const setSocket = async (userType, identifier, socketId) => {
  const key = `${userType}:${identifier}`;
  await redisClient.set(key, socketId);
  console.log("@redisClient", redisClient);
};

const getSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;
  console.log("@redisClient", redisClient);

  return await redisClient.get(key);
};

const removeSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;
  await redisClient.del(key);
};

module.exports = {
  setSocket,
  getSocket,
  removeSocket,
};
