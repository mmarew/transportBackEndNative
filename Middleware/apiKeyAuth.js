require("dotenv").config();

const API_KEY = process.env.API_KEY || "your-secret-api-key"; // Fallback for safety

const apiKeyAuth = (req, res, next) => {
  const apiKey = req.get("X-API-Key");

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ message: "Unauthorized: Invalid API Key" });
  }

  next();
};

module.exports = apiKeyAuth;
