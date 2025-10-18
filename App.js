// // App.js
const dotenv = require("dotenv");
dotenv.config();
{
  /*
  This is non clustering part of the server
  */
}
const getLocalIpAddress = require("./Utils/MyIpAddress.js");
getLocalIpAddress();
//import express server setup
const app = require("./Config/Express.config.js");
const { createServer: createHTTPServer } = require("http");
// import socket adapter
const { initSocket } = require("./Config/SocketAdapter.config.js");

const onStartUp = async () => {
  try {
    console.log("⏳ Running startup tasks...");
    // Add your startup logic here (e.g., DB connection)
    // createTable();
  } catch (error) {
    console.error("❌ Startup error:", error);
    process.exit(1);
  }
};

const startServer = async () => {
  // Create HTTP server
  const httpServer = createHTTPServer(app);

  initSocket({ httpServer }); // Initialize Socket.IO

  const PORT = process.env.PORT || 3000;
  httpServer?.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Server is running at http://localhost:${PORT}`);
    onStartUp();
  });
};

startServer();
{
  /*
  This is   clustering part of the server
  */
}
// const cluster = require("cluster");
// const getLocalIpAddress = require("./Utils/MyIpAddress.js");

// const numCPUs = 1; //os.cpus().length;
// console.log("@Total CPU Cores:", numCPUs);

// if (cluster?.isMaster) {
//   console.log(`🧠 Master process started | PID: ${process.pid}`);

//   for (let i = 0; i < numCPUs; i++) {
//     const worker = cluster?.fork();
//     console.log(`🔧 Forked worker #${i + 1} | PID: ${worker.process.pid}`);
//   }

//   cluster?.on("exit", (worker, code, signal) => {
//     console.log(`💀 Worker PID: ${worker.process.pid} died. Restarting...`);
//     const newWorker = cluster?.fork();
//     console.log(`🔁 Restarted new worker | PID: ${newWorker.process.pid}`);
//   });
//   getLocalIpAddress();
// } else {
//   console.log(`🚀 Worker process running | PID: ${process.pid}`);
//   require("./Config/Worker.config.js"); // Start the server
// }
