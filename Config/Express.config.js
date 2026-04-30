// Config/httpServer.js
const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("../api-docs.json");

let Routes;
try {
  Routes = require("../Routes");
} catch (error) {
  console.error("ERROR LOADING ROUTES:", error.message);
  console.error(error.stack);
  throw error;
}

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
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20000, // Limit each IP to 20,000 requests per windowMs
  message: "Too many requests from this IP, please try again in an hour!",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter); // Apply to all requests

// --- LOGGING ---
const requestLogger = require("../Middleware/RequestLogger");
app.use(requestLogger);

// 4. Body Parsers - Reading data from body into req.body
app.use(express.json({ limit: "10kb" })); // Limit request body size
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// 5. Data Sanitization - Handled by Joi and Helmet

// --- ROUTES ---

// Serve static files from the 'uploads' directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use("/Assets", express.static(path.join(__dirname, "../Assets")));

// API Documentation - Swagger UI
app.use(
  "/api-docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerDocument, {
    explorer: true,
    swaggerOptions: {
      docExpansion: "none",
      filter: true,
      showRequestDuration: true,
    },
  }),
);

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
//   process.exit(1); // Non-zero exit = crash (PM2 WILL restart)
// });

// 7. Global Error Handler
const globalErrorHandler = require("../Middleware/GlobalErrorHandler");

app.use(globalErrorHandler);

module.exports = app;
