"use strict";

const { createServer } = require("http");
const app = require("./httpServer.config");
const { initSocket } = require("./SocketAdapter.config");

// Graceful shutdown and error handling
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
  process.exit(1);
});
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

// Startup logic
const onStartUp = async () => {
  try {
    console.log("⏳ Running startup tasks...");
    // Add your startup logic here (e.g., DB connection)
  } catch (error) {
    console.error("❌ Startup error:", error);
    process.exit(1);
  }
};

const startServer = async () => {
  await onStartUp();

  const server = createServer(app);

  initSocket(server); // Initialize Socket.IO

  const PORT = process.env.PORT || 3000;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
  });
};

startServer();
