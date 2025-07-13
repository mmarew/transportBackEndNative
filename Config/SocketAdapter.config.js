const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const WSPusher = require("../Utils/WSPusher.js");
const { socketIO } = require("../Utils/WsServerResponder");
const { REDIS_SOCKET_PATH } = require("../Utils/Constants.js");
const {
  removeSocket,
  getAllSockets,
} = require("../Utils/WsConnectionStore.js");

async function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: "*", // Set to your domain in production
    },
  });

  // Use ioredis and explicitly set the socket path
  // const pubClient = new Redis({ path: REDIS_SOCKET_PATH });
  // const subClient = new Redis({ path: REDIS_SOCKET_PATH });

  const { UPSTASH_REDIS_URL } = require("../Utils/Constants.js");

  // Use Upstash with ioredis
  // const pubClient = new Redis(UPSTASH_REDIS_URL);
  // const subClient = new Redis(UPSTASH_REDIS_URL);

  const pubClient = new Redis(UPSTASH_REDIS_URL, {
    tls: {},
    connectTimeout: 10000, // optional: 10s timeout
  });

  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => console.error("Redis Pub Error:", err));
  subClient.on("error", (err) => console.error("Redis Sub Error:", err));

  io.adapter(createAdapter(pubClient, subClient)); // Still compatible with ioredis if socket path works

  socketIO.io = io;

  io.on("connection", (socket) => {
    WSPusher({ io, socket });
    // getAllSockets();
    socket.on("message", (msg) => {
      socket.emit("response", "Message received");
    });
    socket.on("locationUpdate", (data) => {
      console.log("@locationUpdate", data);

      // const { userId, tripId, coordinates } = data;
      // // Broadcast to the other party in the trip
      // io.to(getOtherUserSocketId(tripId, userId)).emit(
      //   "locationUpdate",
      //   coordinates
      // );
    });
    socket.on("disconnect", () => {
      const userType = socket?.userType,
        identifier = socket?.identifier;
      if (identifier && userType) removeSocket(userType, identifier);
      console.log("❌ Disconnected:", socket.id);
    });
    socket.on("error", (error) => {
      console.error("⚠️ Socket error:", error);
    });
    socket.on("connect_error", (error) => {
      console.error("⚠️ Socket connection error:", error);
    });

    socket.on("close", () => {
      console.log("Socket closed");
    });
  });
}

module.exports = { initSocket };
