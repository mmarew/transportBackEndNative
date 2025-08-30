// loggingMiddleware.js
const fs = require("fs");
const path = require("path");

// Define the log file path
const logFilePath = path.join(__dirname, "../log.txt");

// Middleware to override console.log and console.error
function loggingMiddleware(req, res, next) {
  // Store the original console.log and console.error functions
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;

  // Override console.log
  console.log = (...args) => {
    logToFile("LOG", args, originalConsoleLog);
  };

  // Override console.error
  // console.error = (...args) => {
  //   logToFile("ERROR", args, originalConsoleError);
  // };

  // Helper function to write logs to the file
  function logToFile(type, args, originalFunction) {
    const message = args
      .map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : arg))
      .join(" ");
    const timestampedMessage = `[${new Date().toISOString()}] [${type}] ${message}\n`;

    // Append the log to log.txt
    fs.appendFile(logFilePath, timestampedMessage, (err) => {
      if (err) {
        // In case of file write error, print to original console.error
        originalConsoleError("Error writing to log file:", err);
      }
    });

    // Also print to the original console function (log or error)
    originalFunction(...args);
  }
}

module.exports = loggingMiddleware;
