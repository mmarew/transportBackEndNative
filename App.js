const express = require("express");
require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const Routes = require("./Routes/index.js");
const WSPusher = require("./Utils/WSPusher.js");
const { removeWSFromList } = require("./Utils/RemoveWsFromList.js");
const path = require("path");
const { createUserSystem } = require("./Services/User.service.js");
const loggingMiddleware = require("./Middleware/loggingMiddleware.js");

// Initialize Express app
const app = express();
// app.use(loggingMiddleware);
loggingMiddleware();
console.log('path.join(__dirname, "uploads")', path.join(__dirname, "uploads"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(Routes);

// Create HTTP server and attach the Express app to it
const server = http.createServer(app);

// Initialize WebSocket server instance
const wss = new WebSocket.Server({ server });
const handleMessage = (incomingMessage) => {
  const textMessage = incomingMessage.toString();

  if (textMessage) {
    ws.send("i get text messages from clients");
  }
};
const handleClose = (ws) => {
  removeWSFromList(ws);
};
const handleConnection = (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split("?")[1]);
  WSPusher(urlParams, ws);

  ws.on("message", () => handleMessage(ws));

  ws.on("close", () => handleClose(ws));
};

// WebSocket connection handling
wss.on("connection", handleConnection);

// Create tables in the database
const onStartUp = async () => {
  try {
  } catch (error) {
    console.log("error", error);
  }
};
onStartUp();
app.get("", (req, res) => {
  res.json({ message: "Server is running" });
});
// Start the HTTP server on port 3000
server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("Server started on port http://localhost:3000");
});
