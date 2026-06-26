const Config = require("./Config");
//constants;

const REDIS_SOCKET_PATH = process.env.REDIS_SOCKET_PATH || "";
const UPSTASH_REDIS_URL = Config.REDIS.URL;

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

module.exports = { REDIS_SOCKET_PATH, UPSTASH_REDIS_URL, HTTP_STATUS };
