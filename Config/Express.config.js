// Config/httpServer.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
const xss = require("xss-clean");

const Routes = require("../Routes");
const loggingMiddleware = require("../Middleware/LoggingMiddleware");
const apiKeyAuth = require("../Middleware/apiKeyAuth");

const app = express();

// Trust the reverse proxy (e.g., Vercel/NGINX/Heroku) so req.ip uses X-Forwarded-For
// This must be set BEFORE using rate limiting or anything that relies on client IP
// On Vercel, trusting the first proxy is sufficient
app.set("trust proxy", 1);

// --- GLOBAL MIDDLEWARE ---

// 1. Set security HTTP headers
app.use(helmet());

// 2. Enable CORS - In production, you should restrict this to your frontend's domain
app.use(cors());

// 3. Rate Limiting - Protect against brute-force/DoS attacks
if (process.env.NODE_ENV !== "development") {
  const limiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200, // Limit each IP to 200 requests per windowMs
    message: "Too many requests from this IP, please try again in an hour!",
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter); // Apply to all requests
}

// 4. Body Parsers - Reading data from body into req.body
app.use(express.json({ limit: "10kb" })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// 5. Data Sanitization
app.use(mongoSanitize()); // Against NoSQL query injection
app.use(xss()); // Against Cross-Site Scripting (XSS) attacks

// 6. Custom Logging
loggingMiddleware();

// --- ROUTES ---

// Serve static files from the 'uploads' directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// API Routes - Protected by API Key
// app.use("/", apiKeyAuth, Routes);
app.use("/", Routes);
// --- HEALTH & CRASH CHECKS ---

// Health Check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

// Crash test endpoint
// app.get("/crash", () => {
//   console.log("Forcing a crash!");
//   process.exit(1); // Non-zero exit = crash (PM2 WILL restart)
// });

module.exports = app;
