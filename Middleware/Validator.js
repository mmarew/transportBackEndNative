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
      // Always print to terminal regardless of Winston log level
      console.error(`\n❌ VALIDATION FAILED [${method} ${path}]`);
      console.error('   source  :', source);
      console.error('   details :', JSON.stringify(details, null, 4));
      console.error('   body    :', JSON.stringify(data, null, 4));
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
    req[source] = value;
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
