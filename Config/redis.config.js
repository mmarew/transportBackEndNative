import { REDIS_SOCKET_PATH } from "../Utils/Constants";

const Redis = require("ioredis");

const redis = new Redis(REDIS_SOCKET_PATH);
export { redis };
