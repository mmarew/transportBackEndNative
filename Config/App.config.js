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

// Create and start HTTP + Socket.IO server
const { createServer } = require("http");
const { initSocket } = require("./SocketAdapter");

const server = createServer(app);
initSocket(server); // load balanced socket logic here

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server started on http://localhost:${PORT}`);
});
