// // Utils/WsConnectionStore.js
// const { createClient } = require("redis");

// const redisClient = createClient({
//   socket: {
//     host: process.env.REDIS_HOST || "127.0.0.1",
//     port: process.env.REDIS_PORT || 6379,
//   },
// });

// redisClient.connect();

// const setSocket = async (userType, identifier, socketId) => {
//   const key = `${userType}:${identifier}`;
//   await redisClient.set(key, socketId);
//   console.log("@setSocket redisClient", redisClient);
// };

// const getSocket = async (userType, identifier) => {
//   const key = `${userType}:${identifier}`;
//   console.log("@getSocket redisClient", redisClient);
//   console.dir("@dirgetSocket", redisClient, { depth: null });

//   return await redisClient.get(key);
// };

// const removeSocket = async (userType, identifier) => {
//   const key = `${userType}:${identifier}`;
//   await redisClient.del(key);
//   console.log("@removeSocket redisClient", redisClient);
// };

// module.exports = {
//   setSocket,
//   getSocket,
//   removeSocket,
// };

// Utils/WsConnectionStore.js

const Redis = require("ioredis");
const { redis } = require("../Config/redis.config");

// Connect using the same Redis socket path
const redisClient = redis;

redisClient.on("error", (err) => {
  console.error("Redis connection error:", err);
});

const setSocket = async (userType, identifier, socketId) => {
  const key = `${userType}:${identifier}`;
  await redisClient.set(key, socketId);
  console.log("@setSocket redisClient", redisClient.status);
};

const getSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;
  console.log("@getSocket redisClient", redisClient.status);
  return await redisClient.get(key);
};

const removeSocket = async (userType, identifier) => {
  const key = `${userType}:${identifier}`;
  await redisClient.del(key);
  console.log("@removeSocket redisClient", redisClient.status);
};

module.exports = {
  setSocket,
  getSocket,
  removeSocket,
};
