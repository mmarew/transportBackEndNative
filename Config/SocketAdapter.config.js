// SocketAdapter.config.js
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const WSPusher = require("../Utils/WSPusher.js");
const { removeWSFromList } = require("../Utils/RemoveWsFromList");
const { socketIO } = require("../Utils/WsServerResponder");

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = process.env.REDIS_PORT || 6379;

async function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*", // Update for production
    },
  });

  // Redis clients
  const pubClient = createClient({
    socket: { host: REDIS_HOST, port: REDIS_PORT },
  });
  const subClient = pubClient.duplicate();

  await pubClient.connect();
  await subClient.connect();

  // Use Redis adapter
  io.adapter(createAdapter(pubClient, subClient));
  socketIO.io = io; // globally assign

  io.on("connection", (socket) => {
    const socketId = socket.id;
    const urlParams = new URLSearchParams(socket.handshake.query);
    console.log("🔌 Client connected with socketId:", socketId);

    WSPusher(urlParams, socketId, io);

    socket.on("message", (incomingMessage) => {
      const textMessage = incomingMessage.toString();
      if (textMessage) {
        socket.emit("response", "Message received");
      }
    });

    socket.on("disconnect", () => {
      removeWSFromList(socket);
      console.log("❌ Client disconnected:", socket.id);
    });
  });
}

module.exports = { initSocket };
