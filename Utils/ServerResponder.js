const { HTTP_STATUS } = require("./Constants");

/**
 * Sends a standardized JSON response to the client
 * @param {Object} res - Express response object
 * @param {Object} data - Response data object with message and optional fields
 * @param {number} [statusCode] - Optional HTTP status code. If not provided, will be determined from data.message
 * @returns {void}
 */
const ServerResponder = (res, data, statusCode = null) => {
  // Validate that res is a valid Express response object
  if (
    !res ||
    typeof res.status !== "function" ||
    typeof res.json !== "function"
  ) {
    const logger = require("./logger");
    logger.error("ServerResponder called with invalid response object", {
      resType: typeof res,
      hasStatus: res && typeof res.status,
      hasJson: res && typeof res.json,
      data: data,
    });
    // If res is not valid, we can't send a response, so just return
    return;
  }

  try {
    // Normalize data to ensure both 'status' and 'message' are present for compatibility
    if (data && typeof data === "object" && !Array.isArray(data)) {
      if (data.status === "success" && !data.message) {
        data.message = "success";
      } else if (data.message && !data.status) {
        // data.status = data.message;
      }
    }

    const { status, message } = data || {};
    const responseStatus = status || message;

    // If statusCode is explicitly provided, use it
    if (statusCode) {
      return res.status(statusCode).json(data);
    }

    // Determine status code based on message/status type
    if (responseStatus === "error") {
      // Check if it's a client error (4xx) or server error (5xx)
      const errorCode = data?.code || data?.error;
      if (errorCode === "VALIDATION_ERROR" || errorCode === "BAD_REQUEST") {
        return res.status(HTTP_STATUS.BAD_REQUEST).json(data);
      }
      if (
        errorCode === "NOT_FOUND" ||
        (typeof data?.error === "string" &&
          data?.error?.toLowerCase().includes("not found"))
      ) {
        return res.status(HTTP_STATUS.NOT_FOUND).json(data);
      }
      if (
        errorCode === "UNAUTHORIZED" ||
        (typeof data?.error === "string" &&
          data?.error?.toLowerCase().includes("unauthorized"))
      ) {
        return res.status(HTTP_STATUS.UNAUTHORIZED).json(data);
      }
      if (
        errorCode === "FORBIDDEN" ||
        (typeof data?.error === "string" &&
          data?.error?.toLowerCase().includes("forbidden"))
      ) {
        return res.status(HTTP_STATUS.FORBIDDEN).json(data);
      }
      // Check for conflict/duplicate errors (409)
      const errorMessage =
        typeof data?.error === "string" ? data?.error?.toLowerCase() : "";
      if (
        errorCode === "CONFLICT" ||
        errorCode === "DUPLICATE" ||
        errorMessage.includes("already been created") ||
        errorMessage.includes("already exists") ||
        errorMessage.includes("duplicate") ||
        (errorMessage.includes("already") &&
          (errorMessage.includes("request") ||
            errorMessage.includes("record") ||
            errorMessage.includes("entry") ||
            errorMessage.includes("resource")))
      ) {
        return res.status(HTTP_STATUS.CONFLICT).json(data);
      }
      // Default to 500 for server errors
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json(data);
    }

    if (responseStatus === "success") {
      // Check if it's a create operation (usually indicated by presence of created data)
      if (
        data?.data &&
        typeof data.data === "object" &&
        !Array.isArray(data.data)
      ) {
        // Could be a create operation, but we'll default to 200 unless explicitly 201
        return res.status(HTTP_STATUS.OK).json(data);
      }
      return res.status(HTTP_STATUS.OK).json(data);
    }

    // Default to 200 for other messages
    return res.status(HTTP_STATUS.OK).json(data);
  } catch (error) {
    const logger = require("./logger");
    logger.error("Error in ServerResponder", {
      error: error.message,
      stack: error.stack,
    });

    // Check if res is a valid Express response object before trying to use it
    if (
      res &&
      typeof res.status === "function" &&
      typeof res.json === "function"
    ) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        status: "error",
        error: "something went wrong",
      });
    }

    // If res is not valid, log the error but don't try to send a response
    logger.error(
      "Cannot send error response - res is not a valid Express response object",
      {
        resType: typeof res,
        hasStatus: res && typeof res.status,
        hasJson: res && typeof res.json,
      },
    );
  }
};

module.exports = ServerResponder;
