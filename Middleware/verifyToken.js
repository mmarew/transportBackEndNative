const jwt = require("jsonwebtoken");
require("dotenv").config();
const secretKey = process.env.SECRET_KEY;

const verifyTokenOfAxios = (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (authHeader) {
    const token = authHeader.split(" ")[1]; // Extract token from "Bearer <token>"

    try {
      const decoded = jwt.verify(token, secretKey);
      req.user = decoded; // Attach decoded token to request
      next(); // Proceed to the next middleware/controller
    } catch (error) {
      let response;
      switch (error.name) {
        case "TokenExpiredError":
          response = {
            valid: false,
            message: "Token expired",
            error: error.message,
          };
          break;
        case "JsonWebTokenError":
          response = {
            valid: false,
            message: "Invalid token",
            error: error.message,
          };
          break;
        case "NotBeforeError":
          response = {
            valid: false,
            message: "Token not active",
            error: error.message,
          };
          break;
        default:
          response = {
            valid: false,
            message: "Token verification failed",
            error: error.message,
          };
          break;
      }
      return res.status(401).json(response); // Send the error response with status 401 (Unauthorized)
    }
  } else {
    return res.status(401).json({ message: "Authorization header missing" }); // If no auth header present
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
          message: "Token expired",
          error: error.message,
        };
        break;
      case "JsonWebTokenError":
        response = {
          valid: false,
          message: "Invalid token",
          error: error.message,
        };
        break;
      case "NotBeforeError":
        response = {
          valid: false,
          message: "Token not active",
          error: error.message,
        };
        break;
      default:
        response = {
          valid: false,
          message: "Token verification failed",
          error: error.message,
        };
        break;
    }
    return response; // Send the error response with status 401 (Unauthorized)
  }
};

module.exports = { verifyTokenOfAxios, verifyTokenOfWS };
