// worker.config.js

const { createServer } = require("http");
const app = require("./httpServer.config");

const { initSocket } = require("./SocketAdapter.config");

// If you have DB startup logic, you can do it here too:
const onStartUp = async () => {
  try {
    console.log("⏳ Running startup tasks...");
    // your startup logic
  } catch (error) {
    console.error("❌ Startup error:", error);
  }
};
onStartUp();

const server = createServer(app);

initSocket(server); // Your Socket.IO logic

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server is running at http://localhost:${PORT}`);
});
