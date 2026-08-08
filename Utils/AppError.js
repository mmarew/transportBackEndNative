/**
 * HTTP status codes as named constants, sourced from Utils/Constants.js
 * (single source of truth). Referenced via `AppError.BAD_REQUEST` etc. so no
 * extra import is needed in files that already `require(".../Utils/AppError")`.
 * Also exposed as `AppError.statusCodes` for response-building code.
 */
const { HTTP_STATUS } = require("./Constants");

class AppError extends Error {
  constructor(messageOrObj, statusCode) {
    let message;
    let code;
    let details;

    if (typeof messageOrObj === "object" && messageOrObj !== null) {
      message = messageOrObj.message;
      code = messageOrObj.code;
      details = messageOrObj.details || messageOrObj.errors; // handle both checks
    } else {
      message = messageOrObj;
    }

    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

Object.assign(AppError, HTTP_STATUS);
AppError.statusCodes = HTTP_STATUS;

module.exports = AppError;
