const { Server: socketServer } = require("socket.io");
const Config = require("../Utils/Config");
const { createAdapter } = require("@socket.io/redis-adapter");
const Redis = require("ioredis");
const WSPusher = require("../Utils/WSPusher");
const { socketIO, sendError } = require("../Utils/WsServerResponder");
const { removeSocket } = require("../Utils/WsConnectionStore");
const {
  sendSocketIONotificationToShipper,
  sendSocketIONotificationToDriver,
} = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");

const logger = require("../Utils/logger");
const { getShipperRequestByRequestUniqueId } = require("../CRUD/Read/ReadData");

async function initSocket({ httpServer }) {
  const io = new socketServer(httpServer, {
    cors: {
      origin: "*", // Set to your domain in production
    },
    allowEIO3: true, // Allow Engine.IO v3 clients
    transports: ["websocket", "polling"], // Support both transports
  });

  const UPSTASH_REDIS_URL = Config.REDIS.URL; // Changed this line

  // Only use Redis adapter if UPSTASH_REDIS_URL is configured
  if (UPSTASH_REDIS_URL) {
    try {
      const redisOptions = {
        tls: {},
        connectTimeout: 10000, // optional: 10s timeout
        retryStrategy: (times) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
        maxRetriesPerRequest: null, // Set to null to prevent MaxRetriesPerRequestError
        enableReadyCheck: true,
        enableOfflineQueue: true, // Enable queue for Socket.IO adapter to work when disconnected
        lazyConnect: true, // Don't connect immediately - wait until ready
      };

      const pubClient = new Redis(UPSTASH_REDIS_URL, redisOptions);

      // Create subClient with same options to ensure enableOfflineQueue is set
      const subClient = new Redis(UPSTASH_REDIS_URL, redisOptions);

      pubClient.on("error", (err) => {
        logger.error("Redis Pub Client Error", {
          error: err.message,
          code: err.code,
          stack: err.stack,
        });
        // Don't throw - let the app continue without Redis
      });

      subClient.on("error", (err) => {
        logger.error("Redis Sub Client Error", {
          error: err.message,
          code: err.code,
          stack: err.stack,
        });
        // Don't throw - let the app continue without Redis
      });

      // Handle MaxRetriesPerRequestError specifically
      pubClient.on("close", () => {
        logger.warn("Redis Pub Client Connection Closed");
      });

      subClient.on("close", () => {
        logger.warn("Redis Sub Client Connection Closed");
      });

      pubClient.on("reconnecting", (time) => {
        logger.info(`Redis Pub Client Reconnecting in ${time}ms`);
      });

      subClient.on("reconnecting", (time) => {
        logger.info(`Redis Sub Client Reconnecting in ${time}ms`);
      });

      pubClient.on("connect", () => {
        logger.info("Redis Pub Client Connected");
      });

      subClient.on("connect", () => {
        logger.info("Redis Sub Client Connected");
      });

      // Wait for Redis to be ready before initializing adapter
      // This prevents "Stream isn't writeable" errors
      const initializeAdapter = async () => {
        try {
          // Wait for both clients to be ready (or timeout after 5 seconds)
          await Promise.race([
            Promise.all([
              new Promise((resolve, reject) => {
                if (pubClient.status === "ready") {
                  resolve();
                } else {
                  const timeout = setTimeout(() => {
                    pubClient.removeListener("ready", resolve);
                    reject(new Error("Pub client connection timeout"));
                  }, 5000);
                  pubClient.once("ready", () => {
                    clearTimeout(timeout);
                    resolve();
                  });
                  pubClient.once("error", (err) => {
                    clearTimeout(timeout);
                    reject(err);
                  });
                }
              }),
              new Promise((resolve, reject) => {
                if (subClient.status === "ready") {
                  resolve();
                } else {
                  const timeout = setTimeout(() => {
                    subClient.removeListener("ready", resolve);
                    reject(new Error("Sub client connection timeout"));
                  }, 5000);
                  subClient.once("ready", () => {
                    clearTimeout(timeout);
                    resolve();
                  });
                  subClient.once("error", (err) => {
                    clearTimeout(timeout);
                    reject(err);
                  });
                }
              }),
            ]),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Redis connection timeout")),
                5000,
              ),
            ),
          ]);

          // Both clients are ready, initialize adapter
          try {
            io.adapter(createAdapter(pubClient, subClient));
            logger.info("Socket.IO Redis Adapter initialized");
          } catch (createAdapterError) {
            // This can happen if Redis disconnects between ready check and adapter creation
            throw createAdapterError;
          }
        } catch (adapterError) {
          // Check if it's a timeout or connection error - these are expected when Redis is unavailable
          const isTimeoutOrConnectionError =
            adapterError.message?.includes("timeout") ||
            adapterError.message?.includes("connection") ||
            adapterError.message?.includes("ECONNREFUSED") ||
            adapterError.message?.includes("ETIMEDOUT");

          if (isTimeoutOrConnectionError) {
            logger.warn(
              "Redis adapter initialization skipped - Redis unavailable (continuing in single-server mode)",
              {
                error: adapterError.message,
                name: adapterError.name,
              },
            );
          } else {
            logger.error("Failed to initialize Redis adapter", {
              error: adapterError.message,
              name: adapterError.name,
              stack: adapterError.stack,
            });
          }
          // Continue without Redis adapter (single server mode)
          // Don't throw - let the app continue
        }
      };

      // Initialize adapter asynchronously - don't await to prevent blocking
      initializeAdapter().catch((error) => {
        logger.error("Error during adapter initialization", {
          error: error.message,
          name: error.name,
          stack: error.stack,
        });
        // Continue without Redis adapter (single server mode)
      });
    } catch (redisError) {
      logger.error("Failed to connect to Redis", {
        error: redisError.message,
        code: redisError.code,
        stack: redisError.stack,
      });
      // Continue without Redis adapter (single server mode)
    }
  } else {
    logger.warn(
      "UPSTASH_REDIS_URL not configured - running in single server mode",
    );
  }

  // set io instance to a global variable to re use it in other modules
  socketIO.io = io;

  io.on("connection", (socket) => {
    logger.info("Socket connection attempt", {
      socketId: socket.id,
      handshake: socket.handshake.query,
    });

    // Handle connection errors
    socket.on("error", (error) => {
      logger.error("Socket error", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });
    });

    socket.on("connect_error", (error) => {
      logger.error("Socket connection error", {
        socketId: socket.id,
        error: error.message,
        stack: error.stack,
      });
    });

    // Initialize socket with authentication
    WSPusher({ io, socket }).catch((error) => {
      logger.application.apiError(error, {
        originalUrl: "WebSocket:WSPusher",
        method: "WS",
        ip: socket.handshake.address,
      });
      sendError(socket, error, "WS_INIT_FAILED");
      socket.disconnect();
    });

    socket.on("message", (msg) => {
      logger.debug("Socket message received", { msg });
      socket.emit("response", "Message received");
    });

    socket.on("locationUpdateToShipper", async (data) => {
      try {
        let phoneNumberOfShipper = data?.shipperPhoneNumber;

        // If phone number is missing but we have request ID, fetch it
        if (!phoneNumberOfShipper && data?.shipperRequestUniqueId) {
          try {
            const shipperRequest = await getShipperRequestByRequestUniqueId(
              data.shipperRequestUniqueId,
            );
            phoneNumberOfShipper = shipperRequest?.phoneNumber;
          } catch (lookupError) {
            logger.warn(
              "Could not lookup shipper phone number for location update",
              {
                error: lookupError.message,
                shipperRequestUniqueId: data?.shipperRequestUniqueId,
              },
            );
          }
        }

        if (phoneNumberOfShipper) {
          await sendSocketIONotificationToShipper({
            eventName: "locationUpdateToShipper",
            phoneNumber: phoneNumberOfShipper,
            message: {
              ...data,
              message: "success",
              messageTypes: messageTypes.update_drivers_location_to_shipper,
            },
          });
          logger.debug("Location update notification sent to shipper", {
            phoneNumber: phoneNumberOfShipper,
          });
        }

        socket.emit("locationUpdateToShipper", data);
      } catch (error) {
        logger.error("locationUpdateToShipper error", {
          socketId: socket.id,
          error: error.message,
        });
      }
    });

    socket.on("locationUpdateToDriver", async (data) => {
      try {
        await sendSocketIONotificationToDriver({
          eventName: "locationUpdateToDriver",
          phoneNumber: data?.driverPhoneNumber,
          message: {
            ...data,
            message: "success",
            messageTypes: messageTypes.update_shipper_location_to_driver,
          },
        });
        logger.debug("Location update notification sent to driver", {
          phoneNumber: data?.driverPhoneNumber,
        });

        socket.emit("locationUpdateToDriver", data);
      } catch (error) {
        logger.error("locationUpdateToDriver error", {
          socketId: socket.id,
          error: error.message,
        });
      }
    });

    socket.on("disconnect", (reason) => {
      logger.info("Socket disconnected", {
        socketId: socket.id,
        reason,
        userType: socket?.userType,
        identifier: socket?.identifier,
      });

      const userType = socket?.userType,
        identifier = socket?.identifier;
      if (identifier && userType) {
        removeSocket(userType, identifier);
      }
    });
  });

  io.engine.on("connection_error", (err) => {
    logger.error("Socket.IO engine connection error", {
      error: err.message,
      code: err.code,
      context: err.context,
    });
  });
}

module.exports = { initSocket };
