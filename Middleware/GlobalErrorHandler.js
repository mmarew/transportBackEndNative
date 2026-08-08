const AppError = require("../Utils/AppError");
const ServerResponder = require("../Utils/ServerResponder");
const logger = require("../Utils/logger");
const Config = require("../Utils/Config");
const { HTTP_STATUS } = require("../Utils/Constants");

const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, AppError.BAD_REQUEST);
};

const handleDuplicateFieldsDB = (err) => {
  // eslint-disable-next-line security/detect-unsafe-regex
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, AppError.BAD_REQUEST);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join(". ")}`;
  return new AppError(message, AppError.BAD_REQUEST);
};

const handleJWTError = () =>
  new AppError("Invalid token. Please log in again!", AppError.UNAUTHORIZED);

const handleJWTExpiredError = () =>
  new AppError("Your token has expired! Please log in again.", AppError.UNAUTHORIZED);

const sendErrorDev = (err, req, res) => {
  // Log error in development
  logger.application.apiError(err, req);

  res.status(err.statusCode).json({
    status: err.status,
    message: err.status,
    error: err,
    stack: err.stack,
  });
};

const sendErrorProd = (err, req, res) => {
  // Log all errors server-side for debugging
  if (err.statusCode >= HTTP_STATUS.BAD_REQUEST && err.statusCode < HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    logger.warn("Client Error", {
      type: "CLIENT_ERROR",
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip,
      userId: req.user?.userId,
    });
  } else {
    logger.application.apiError(err, req);
  }

  // 4xx = client mistake (safe to expose), 5xx = server fault (mask internals)
  const isClientError = err.statusCode >= HTTP_STATUS.BAD_REQUEST && err.statusCode < HTTP_STATUS.INTERNAL_SERVER_ERROR;
  ServerResponder(
    res,
    {
      status: "error",
      error: isClientError ? err.message : "Internal server error",
    },
    err.statusCode || AppError.INTERNAL_SERVER_ERROR,
  );
};

// Express error handlers must have 4 parameters: (err, req, res, next)
// The 'next' parameter is required even if not used
module.exports = (err, req, res, next) => {
  // Reference `next` to satisfy linters that require the 4-arg express error handler signature
  void next;
  // Validate that res is a valid Express response object
  if (
    !res ||
    typeof res.status !== "function" ||
    typeof res.json !== "function"
  ) {
    logger.error("GlobalErrorHandler called with invalid response object", {
      resType: typeof res,
      hasStatus: res && typeof res.status,
      hasJson: res && typeof res.json,
      error: err?.message,
    });
    // If res is not valid, we can't send a response
    return;
  }

  err.statusCode = err.statusCode || AppError.INTERNAL_SERVER_ERROR;
  err.status = err.status || "error";

  if (Config.NODE_ENV === "development") {
    sendErrorDev(err, req, res);
  } else {
    // Create a copy of the error to avoid mutating the original error
    let error = { ...err };
    error.message = err.message;
    error.name = err.name;

    // Handle specific error types
    if (error.name === "CastError") {
      error = handleCastErrorDB(error);
    }
    if (error.code === 11000) // eslint-disable-line no-magic-numbers -- MongoDB duplicate key error code {
      error = handleDuplicateFieldsDB(error);
    }
    if (error.name === "ValidationError") {
      error = handleValidationErrorDB(error);
    }
    if (error.name === "JsonWebTokenError") {
      error = handleJWTError();
    }
    if (error.name === "TokenExpiredError") {
      error = handleJWTExpiredError();
    }

    sendErrorProd(error, req, res);
  }
};
