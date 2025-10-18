const { Server: socketServer } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const WSPusher = require("../Utils/WSPusher.js");
const { socketIO } = require("../Utils/WsServerResponder");
const { removeSocket } = require("../Utils/WsConnectionStore.js");
const {
  sendSocketIONotificationToPassenger,
  sendSocketIONotificationToDriver,
} = require("../Utils/Notifications.js");
const messageTypes = require("../Utils/MessageTypes.js");

async function initSocket({ httpServer }) {
  const io = new socketServer(httpServer, {
    cors: {
      origin: "*", // Set to your domain in production
    },
  });
  const UPSTASH_REDIS_URL = process.env.UPSTASH_REDIS_URL;
  const pubClient = new Redis(UPSTASH_REDIS_URL, {
    tls: {},
    connectTimeout: 10000, // optional: 10s timeout
  });

  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => console.error("Redis Pub Error:", err));
  subClient.on("error", (err) => console.error("Redis Sub Error:", err));

  io.adapter(createAdapter(pubClient, subClient)); // Still compatible with ioredis if socket path works
  // set io instance to a global variable to re use it in other modules
  socketIO.io = io;

  io.on("connection", (socket) => {
    WSPusher({ io, socket });
    // getAllSockets();
    socket.on("message", (msg) => {
      socket.emit("response", "Message received");
    });
    socket.on("locationUpdateToShipper", async (data) => {
      console.log("@locationUpdateToShipper data", data);
      const phoneNumberOfShipper = data?.passengerPhoneNumber;
      const res = await sendSocketIONotificationToPassenger({
        eventName: "locationUpdateToShipper",
        phoneNumber: phoneNumberOfShipper,
        message: {
          ...data,
          message: "success",
          messageTypes: messageTypes.update_drivers_location_to_shipper,
        },
      });
      console.log("@locationUpdateToShipper", res);
      socket.emit("locationUpdateToShipper", data);
    });
    socket.on("locationUpdateToDriver", async (data) => {
      console.log("@locationUpdateToDriver", data);
      const res = await sendSocketIONotificationToDriver({
        eventName: "locationUpdateToDriver",
        phoneNumber: data?.driverPhoneNumber,
        message: {
          ...data,
          message: "success",
          messageTypes: messageTypes.update_shipper_location_to_driver,
        },
      });
      console.log("@locationUpdateToDriver", res);
      socket.emit("locationUpdateToDriver", data);
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
