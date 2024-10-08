const express = require("express");
require("dotenv").config();
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const bodyParser = require("body-parser");
const Routes = require("./Routes/index.js");
const { createTable } = require("./Database/Database.js");
const WSPusher = require("./Utils/WSPusher.js");
const { removeWSFromList } = require("./Utils/RemoveWsFromList.js");
const path = require("path");

// Initialize Express app
const app = express();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.json());
app.use(cors());
app.use(Routes);

// Middleware to parse JSON bodies
app.use(bodyParser.json());

// Middleware to parse URL-encoded bodies
app.use(bodyParser.urlencoded({ extended: true }));

// Create HTTP server and attach the Express app to it
const server = http.createServer(app);

// Initialize WebSocket server instance
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on("connection", (ws, req) => {
  const urlParams = new URLSearchParams(req.url.split("?")[1]);
  WSPusher(urlParams, ws);

  ws.on("message", (incomingMessage) => {
    const textMessage = incomingMessage.toString();
    console.log("textMessage", textMessage);

    if (textMessage) {
    }
  });

  ws.on("close", () => {
    removeWSFromList(ws);
  });
});

// Create tables in the database
const onStartUp = async () => {
  try {
    createTable();
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
