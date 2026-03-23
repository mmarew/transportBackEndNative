const Config = require("../Utils/Config");
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
    return res.status(401).json({ message: "Unauthorized: Invalid API Key" });
  }

  next();
};

module.exports = apiKeyAuth;
