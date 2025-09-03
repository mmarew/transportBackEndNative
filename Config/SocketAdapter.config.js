// const { Server } = require("socket.io");
// const { createAdapter } = require("@socket.io/redis-adapter");
// const Redis = require("ioredis");
// const WSPusher = require("../Utils/WSPusher.js");
// const { socketIO } = require("../Utils/WsServerResponder");
// const { removeSocket } = require("../Utils/WsConnectionStore.js");

// async function initSocket(server) {
//   const io = new Server(server, {
//     cors: {
//       origin: "*", // Set to your domain in production
//     },
//   });
//   const { UPSTASH_REDIS_URL } = require("../Utils/Constants.js");

//   const pubClient = new Redis(UPSTASH_REDIS_URL, {
//     tls: {},
//     connectTimeout: 10000, // optional: 10s timeout
//   });

//   const subClient = pubClient.duplicate();

//   pubClient.on("error", (err) => console.error("Redis Pub Error:", err));
//   subClient.on("error", (err) => console.error("Redis Sub Error:", err));

//   io.adapter(createAdapter(pubClient, subClient)); // Still compatible with ioredis if socket path works

//   socketIO.io = io;

//   io.on("connection", (socket) => {
//     WSPusher({ io, socket });
//     // getAllSockets();
//     socket.on("message", (msg) => {
//       socket.emit("response", "Message received");
//     });
//     socket.on("locationUpdate", (data) => {
//       console.log("@locationUpdate", data);
//     });
//     socket.on("disconnect", () => {
//       const userType = socket?.userType,
//         identifier = socket?.identifier;
//       if (identifier && userType) removeSocket(userType, identifier);
//       console.log("❌ Disconnected:", socket.id);
//     });
//     socket.on("error", (error) => {
//       console.error("⚠️ Socket error:", error);
//     });
//     socket.on("connect_error", (error) => {
//       console.error("⚠️ Socket connection error:", error);
//     });

//     socket.on("close", () => {
//       console.log("Socket closed");
//     });
//   });
// }

// module.exports = { initSocket };

const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const WSPusher = require("../Utils/WSPusher.js");
const { socketIO } = require("../Utils/WsServerResponder");
const { removeSocket } = require("../Utils/WsConnectionStore.js");
const jwt = require("jsonwebtoken"); // Make sure to require jwt

async function initSocket({ httpServer }) {
  console.log("@initSocket httpServer");
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const { UPSTASH_REDIS_URL } = require("../Utils/Constants.js");

  const pubClient = new Redis(UPSTASH_REDIS_URL, {
    tls: {},
    connectTimeout: 10000,
  });

  const subClient = pubClient.duplicate();

  pubClient.on("error", (err) => console.error("Redis Pub Error:", err));
  subClient.on("error", (err) => console.error("Redis Sub Error:", err));

  io.adapter(createAdapter(pubClient, subClient));

  // ==================== ADD AUTHENTICATION MIDDLEWARE ====================
  io.use((socket, next) => {
    console.log("=== SOCKET CONNECTION ATTEMPT ===");
    console.log("Handshake auth:", socket.handshake.auth);
    console.log("Handshake query:", socket.handshake.query);

    // Get token from either auth object or query parameters
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
      console.error("❌ Connection rejected: No token provided");
      return next(new Error("Authentication error: No token provided"));
    }

    // Check if token has Bearer prefix
    if (!token.startsWith("Bearer ")) {
      console.error(
        '❌ Connection rejected: Invalid token format. Expected "Bearer <token>"'
      );
      return next(new Error("Authentication error: Invalid token format"));
    }

    const jwtToken = token.replace("Bearer ", "");

    try {
      // Verify JWT token - replace 'your-secret-key' with your actual secret
      const decoded = jwt.verify(
        jwtToken,
        process.env.SECRET_KEY || "your-secret-key"
      );
      console.log("✅ Token verified for user:", decoded.data);

      // Attach user data to socket for later use
      socket.userData = decoded.data;
      socket.userType = socket.handshake.query?.user || "unknown";
      socket.identifier =
        socket.handshake.query?.phoneNumber || decoded.data.phoneNumber;

      next();
    } catch (error) {
      console.error("❌ Token verification failed:", error.message);
      next(new Error("Authentication error: " + error.message));
    }
  });
  // ==================== END AUTHENTICATION MIDDLEWARE ====================

  socketIO.io = io;

  io.on("connection", (socket) => {
    console.log(
      "✅ Client connected:",
      socket.id,
      "User:",
      socket.userType,
      "Phone:",
      socket.identifier
    );

    WSPusher({ io, socket });

    socket.on("message", (msg) => {
      console.log("Message received from", socket.id, ":", msg);
      socket.emit("response", "Message received");
    });

    socket.on("locationUpdate", (data) => {
      console.log("@locationUpdate from", socket.id, ":", data);
    });

    socket.on("disconnect", () => {
      const userType = socket?.userType,
        identifier = socket?.identifier;
      if (identifier && userType) removeSocket(userType, identifier);
      console.log("❌ Disconnected:", socket.id, "User:", userType);
    });

    socket.on("error", (error) => {
      console.error("⚠️ Socket error for", socket.id, ":", error);
    });

    socket.on("connect_error", (error) => {
      console.error("⚠️ Socket connection error for", socket.id, ":", error);
    });

    socket.on("close", () => {
      console.log("Socket closed:", socket.id);
    });
  });
}

module.exports = { initSocket };
