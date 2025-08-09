// Config/httpServer.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const Routes = require("../Routes");
const loggingMiddleware = require("../Middleware/LoggingMiddleware");

const app = express();

// Middleware
loggingMiddleware();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));
app.use(Routes);

// Health Check
app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

app.get("/crash", () => {
  console.log("Forcing a crash!");
  process.exit(1); // Non-zero exit = crash (PM2 WILL restart)
});

module.exports = app;
