const Config = require("./Config");
//constants;

const REDIS_SOCKET_PATH = "/home/masetawoshacom/tmp/redis.so";
const UPSTASH_REDIS_URL = Config.REDIS.URL;
// ("rediss://default:ASiQAAIncDIyZTZjYmRlMTEyM2Y0YmNmYmE0ZjA3ODU0ZWM4NGU3OXAyMTAzODQ@sound-hornet-10384.upstash.io:6379");

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
