// This file is responsible for setting up the server and initializing the application.
// It includes middleware, routes, and WebSocket handling.
//
// It also includes a health check endpoint and starts the server on a specified port.
//
// It is a crucial part of the application as it brings together all components and starts the server.
//
// It is important to ensure that the server is properly configured and all components are correctly initialized.
// This file is essential for the application to function correctly and handle incoming requests and WebSocket connections.
// This file is responsible for setting up the server and initializing the application.
// It includes middleware, routes, and WebSocket handling.
// It also includes a health check endpoint and starts the server on a specified port.
// It is a crucial part of the application as it brings together all components and starts the server.
// It is important to ensure that the server is properly configured and all components are correctly initialized.
// This file is essential for the application to function correctly and handle incoming requests and WebSocket connections.
// This file is responsible for setting up the server and initializing the application.
// It includes middleware, routes, and WebSocket handling.
// It also includes a health check endpoint and starts the server on a specified port.
// It is a crucial part of the application as it brings together all components and starts the server.
// It is important to ensure that the server is properly configured and all components are correctly initialized.
// This file is essential for the application to function correctly and handle incoming requests and WebSocket connections.
// This file is responsible for setting up the server and initializing the application.
// It includes middleware, routes, and WebSocket handling.
// It also includes a health check endpoint and starts the server on a specified port.

const express = require("express");
require("dotenv").config();
const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const Routes = require("../Routes/index.js");
const WSPusher = require("../Utils/WSPusher.js");
const { removeWSFromList } = require("../Utils/RemoveWsFromList.js");
const path = require("path");
const loggingMiddleware = require("../Middleware/LoggingMiddleware.js");
const { socketIO } = require("../Utils/WsServerResponder.js");

// Initialize Express app
const app = express();

// Apply middleware
loggingMiddleware();
app.use("../uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(Routes);

// Create HTTP server and attach Express app
const server = createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Adjust according to your security preferences
  },
});

io.on("connection", (socket) => {
  const socketId = socket.id;
  console.log("Client connected with socketId :", socketId);
  const urlParams = new URLSearchParams(socket.handshake.query);
  socketIO.io = io;
  WSPusher(urlParams, socketId, io);

  socket.on("message", (incomingMessage) => {
    const textMessage = incomingMessage.toString();
    if (textMessage) {
      socket.emit("response", "I received text messages from clients");
    }
  });

  socket.on("disconnect", () => {
    removeWSFromList(socket);
    console.log("Client disconnected:", socket.id);
  });
});

// Create tables in the database (startup logic)
const onStartUp = async () => {
  try {
    // Initialization logic here
  } catch (error) {
    console.error("Startup error:", error);
  }
};
onStartUp();

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Server is running" });
});

// Start HTTP server
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on port http://localhost:${PORT}`);
});
