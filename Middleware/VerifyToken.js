const jwt = require("jsonwebtoken");
const { getData } = require("../CRUD/Read/ReadData");
const secretKey = process.env.SECRET_KEY;

const verifyTokenOfAxios = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;

  if (authHeader) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, secretKey);
      const data = decoded?.data;
      const userUniqueId = data?.userUniqueId;
      // const roleId = data?.roleId;

      try {
        const user = await getData({
          tableName: "Users",
          conditions: { userUniqueId },
        });

        if (user.length > 0) {
          req.user = { ...user[0], ...data };
          next();
        } else {
          return res.status(401).json({
            message: "error",
            error: "User not found in the token",
          });
        }
      } catch (dbError) {
        console.error("Database error:", dbError);

        // Handle specific MySQL timeout error
        if (dbError.code === "ETIMEDOUT") {
          return res.status(503).json({
            message: "error",
            error: "Connection timeout. Please try again later.",
          });
        }

        // Generic database error
        return res.status(500).json({
          message: "error",
          error: "Database error occurred",
        });
      }
    } catch (tokenError) {
      // Your existing token error handling
      let response;
      console.log("@token error ", tokenError.name);

      switch (tokenError.name) {
        case "TokenExpiredError":
          response = { valid: false, message: "error", error: "Token expired" };
          break;
        case "JsonWebTokenError":
          response = { valid: false, message: "error", error: "Invalid token" };
          break;
        case "NotBeforeError":
          response = {
            valid: false,
            message: "error",
            error: "Token not active",
          };
          break;
        default:
          response = {
            valid: false,
            message: "error",
            error: "Token verification failed",
          };
          break;
      }
      return res.status(401).json(response);
    }
  } else {
    return res.status(401).json({
      message: "error",
      error: "Authorization header missing",
    });
  }
};
const verifyTokenOfWS = async (tokenData) => {
  const token = tokenData.split(" ")[1]; // Extract token from "Bearer <token>"
  try {
    const decoded = jwt.verify(token, secretKey);
    decoded.valid = true;
    return decoded;
  } catch (error) {
    let response;
    switch (error.name) {
      case "TokenExpiredError":
        response = {
          valid: false,
          message: "error",
          error: "Token expired",
          // error: error.message,
        };
        break;
      case "JsonWebTokenError":
        response = {
          valid: false,
          message: "error",
          error: "Invalid token",
          // error: error.message,
        };
        break;
      case "NotBeforeError":
        response = {
          valid: false,
          message: "error",
          error: "Token not active",
          // error: error.message,
        };
        break;
      default:
        response = {
          valid: false,
          error: "Token verification failed",
          message: "error",
          // error: error.message,
        };
        break;
    }
    return response; // Send the error response with status 401 (Unauthorized)
  }
};
const verifyIfUserIsSupperAdmin = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1];
    try {
      const decoded = jwt.verify(token, secretKey);
      const data = decoded?.data;
      console.log("@verifyIfUserIsSupperAdmin data =========> ", data);
      const roleId = data?.roleId;
      if (roleId !== 6) {
        return res.status(401).json({
          message: "error",
          error: "User is not a supper admin",
        });
      }
      next();
      return roleId;
    } catch (error) {
      console.log("Error in verifyIfUserIsSupperAdmin", error);
      return res.status(401).json({
        message: "error",
        error: "User is not a supper admin",
      });
    }
  }
  console.log("@verifyIfUserIsSupperAdmin authHeader", authHeader);
  next();
};

module.exports = {
  verifyTokenOfAxios,
  verifyTokenOfWS,
  verifyIfUserIsSupperAdmin,
};
