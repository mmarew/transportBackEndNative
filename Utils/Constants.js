const Config = require("./Config");
//constants;

const REDIS_SOCKET_PATH = process.env.REDIS_SOCKET_PATH || "";
const UPSTASH_REDIS_URL = Config.REDIS.URL;

// HTTP Status Codes
// Single source of truth — Utils/AppError re-exports these as AppError.OK,
// AppError.BAD_REQUEST, ... so existing AppError throws can reference them
// without an extra import.
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  PAYMENT_REQUIRED: 402,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
};

module.exports = { REDIS_SOCKET_PATH, UPSTASH_REDIS_URL, HTTP_STATUS };
