"use strict";

const { createServer } = require("http");
const app = require("./Express.config");
const { initSocket } = require("./SocketAdapter.config");
const logger = require("../Utils/logger");
const Config = require("../Utils/Config");

// Graceful shutdown and error handling
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception", { error: err.message, stack: err.stack });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection", { reason });
  process.exit(1);
});
process.on("SIGTERM", () => {
  process.exit(0);
});

// Startup logic
const onStartUp = async () => {
  try {

    // Add your startup logic here (e.g., DB connection)
    // createTable();
  } catch (error) {
    logger.error("Startup error", { error: error.message, stack: error.stack });
    process.exit(1);
  }
};

const startServer = async () => {
  await onStartUp();

  const server = createServer(app);

  initSocket(server); // Initialize Socket.IO

  const PORT = Config.PORT;
  server.listen(PORT, "0.0.0.0", () => {

  });
};

startServer();
