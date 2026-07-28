const AppError = require("../Utils/AppError");
const Joi = require("joi");
const logger = require("../Utils/logger");

const validator = (schema, source = "body") => {
  return (req, res, next) => {
    const data = req[source];
    const path = req.path || req.originalUrl || req.url;
    const method = req.method;

    logger.debug("@validator input", {
      method,
      path,
      source,
      dataKeys: data && typeof data === "object" ? Object.keys(data) : [],
    });

    // Handle empty body for POST requests
    if (
      source === "body" &&
      req.method === "POST" &&
      (!data || Object.keys(data).length === 0)
    ) {
      return next(
        new AppError(
          `Request body cannot be empty for ${req.method} requests to ${path}`,
          400,
        ),
      );
    }

    const { error, value } = schema.validate(data, {
      abortEarly: false,
      allowUnknown: true,
      stripUnknown: true,
    });

    if (error) {
      const errMsg = error.details?.map((d) => d.message).join("; ");
      const details = error.details?.map((d) => ({
        field: d.path?.join(".") || d.context?.key,
        message: d.message,
      }));
      logger.warn("@validator schema.validate failed", {
        method,
        path,
        source,
        details,
        message: error.message,
      });
      return next(
        new AppError(
          {
            message: errMsg || "Validation failed",
            code: "VALIDATION_ERROR",
            details,
          },
          400,
        ),
      );
    }

    // Replace validated data
    // Express 5 uses defineGetter (no setter) for req.query, so direct
    // assignment silently fails. Override the property descriptor instead.
    Object.defineProperty(req, source, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
};

// Add UUID validation helper
const uuidSchema = Joi.string()
  .guid({
    version: ["uuidv4"],
  })
  .required();

module.exports = { validator, uuidSchema };
