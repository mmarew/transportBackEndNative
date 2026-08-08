const Config = require("../Utils/Config");
const { HTTP_STATUS } = require("../Utils/Constants");
const API_KEY = Config.API_KEY || "your-secret-api-key"; // Fallback for safety
// Public paths that should not require an API key (e.g., health checks)
const PUBLIC_PATHS = new Set(["/", "/crash"]);

const apiKeyAuth = (req, res, next) => {
  // Allow preflight and public endpoints
  if (req.method === "OPTIONS" || PUBLIC_PATHS.has(req.path)) {
    return next();
  }

  const apiKey = req.get("X-API-Key");

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({ message: "Unauthorized: Invalid API Key" });
  }

  next();
};

module.exports = apiKeyAuth;
