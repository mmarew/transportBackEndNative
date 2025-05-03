// const express = require("express");
// require("dotenv").config();
// const { createServer } = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");
// const Routes = require("./Routes/index.js");
// const WSPusher = require("./Utils/WSPusher.js");
// const { removeWSFromList } = require("./Utils/RemoveWsFromList.js");
// const path = require("path");
// const loggingMiddleware = require("./Middleware/LoggingMiddleware.js");
// const { socketIO } = require("./Utils/WsServerResponder.js");

// // Initialize Express app
// const app = express();

// // Apply middleware
// loggingMiddleware();
// app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cors());
// app.use(Routes);

// // Create HTTP server and attach Express app
// const server = createServer(app);

// // Initialize Socket.IO
// const io = new Server(server, {
//   cors: {
//     origin: "*", // Adjust according to your security preferences
//   },
// });

// io.on("connection", (socket) => {
//   const socketId = socket.id;
//   console.log("Client connected with socketId :", socketId);
//   const urlParams = new URLSearchParams(socket.handshake.query);
//   socketIO.io = io;
//   WSPusher(urlParams, socketId, io);

//   socket.on("message", (incomingMessage) => {
//     const textMessage = incomingMessage.toString();
//     if (textMessage) {
//       socket.emit("response", "I received text messages from clients");
//     }
//   });

//   socket.on("disconnect", () => {
//     removeWSFromList(socket);
//     console.log("Client disconnected:", socket.id);
//   });
// });

// // Create tables in the database (startup logic)
// const onStartUp = async () => {
//   try {
//     // Initialization logic here
//   } catch (error) {
//     console.error("Startup error:", error);
//   }
// };
// onStartUp();

// // Health check endpoint
// app.get("/", (req, res) => {
//   res.json({ message: "Server is running" });
// });

// // Start HTTP server
// const PORT = process.env.PORT || 3000;

// server.listen(PORT, "0.0.0.0", () => {
//   console.log(`Server started on port http://localhost:${PORT}`);
// });

// app.js
const cluster = require("cluster");
const os = require("os");

const numCPUs = os.cpus().length;

console.log("@Total CPU Cores:", numCPUs);

if (cluster.isMaster) {
  console.log(`🧠 Master process started | PID: ${process.pid}`);

  for (let i = 0; i < numCPUs; i++) {
    const worker = cluster.fork();
    console.log(`🔧 Forked worker #${i + 1} | PID: ${worker.process.pid}`);
  }

  cluster.on("exit", (worker, code, signal) => {
    console.log(`💀 Worker PID: ${worker.process.pid} died. Restarting...`);
    const newWorker = cluster.fork();
    console.log(`🔁 Restarted new worker | PID: ${newWorker.process.pid}`);
  });
} else {
  console.log(`🚀 Worker process running | PID: ${process.pid}`);
  require("./Config/Worker.config.js"); // Start the server
}
