// redis config
const { REDIS_SOCKET_PATH, UPSTASH_REDIS_URL } = require("../Utils/Constants");

// const Redis = require("ioredis");

// const redis = new Redis(REDIS_SOCKET_PATH);
const Redis = require("ioredis");

const redis = new Redis(UPSTASH_REDIS_URL);

redis.set("testKey", "Hello Upstash!");
redis.get("testKey").then(console.log);

module.exports = { redis };
