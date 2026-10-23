"use strict";

/**
 * Live-socket side of the session registry.
 *
 * Every authenticated socket joins a room named after its `UserSessions` row
 * (`session:<sessionUniqueId>`). Revoking that row disconnects the room, so an
 * already-open realtime channel dies immediately instead of surviving until the
 * next HTTP request. Because sockets auto-join a room with their own id, the
 * same mechanism works when the Redis adapter fans the disconnect out across
 * multiple server instances.
 *
 * This module is deliberately tiny and has no dependency on the session
 * registry itself, so `SessionRegistry` can require it without a cycle.
 */

const logger = require("./logger");

const SESSION_ROOM_PREFIX = "session:";

const sessionRoom = (sessionUniqueId) =>
  `${SESSION_ROOM_PREFIX}${sessionUniqueId}`;

/** Joins the socket to its session room. No-op for tokens without a session. */
const joinSessionRoom = (socket, sessionUniqueId) => {
  if (!socket || !sessionUniqueId) return false;
  socket.join(sessionRoom(sessionUniqueId));
  return true;
};

/**
 * Disconnects every socket bound to a revoked/expired session.
 *
 * Returns the number of sockets that were connected to that room on THIS
 * process (useful for logs/tests); with the Redis adapter the disconnect also
 * reaches sockets held by other processes.
 */
const disconnectSessionSockets = (sessionUniqueId) => {
  if (!sessionUniqueId) return 0;

  // Lazy require keeps the module loadable from unit tests and from code paths
  // that run before Socket.IO has been initialised (e.g. cleanup jobs).
  const { socketIO } = require("./WsServerResponder");
  const io = socketIO.io;
  if (!io || typeof io.to !== "function") return 0;

  const room = sessionRoom(sessionUniqueId);
  const localSockets = io.sockets?.adapter?.rooms?.get(room)?.size || 0;

  try {
    // Socket.IO's BroadcastOperator disconnects the room through the adapter,
    // so this includes sockets on other nodes when Redis is configured.
    io.to(room).disconnectSockets(true);
  } catch (error) {
    logger.warn("Failed to disconnect revoked session sockets", {
      sessionUniqueId,
      error: error.message,
    });
    return 0;
  }

  return localSockets;
};

module.exports = {
  SESSION_ROOM_PREFIX,
  sessionRoom,
  joinSessionRoom,
  disconnectSessionSockets,
};
