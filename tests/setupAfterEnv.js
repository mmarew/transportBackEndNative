jest.setTimeout(60000);

// ── Suppress VALIDATION FAILED console.error noise from Middleware/Validator.js ──
// Those are expected in tests that intentionally trigger validation errors.
const origConsoleError = console.error;
console.error = (...args) => {
  const msg = typeof args[0] === "string" ? args[0] : "";
  if (
    msg.includes("VALIDATION FAILED") ||
    msg.includes("   source  :") ||
    msg.includes("   details :") ||
    msg.includes("   body    :")
  ) {
    return;
  }
  origConsoleError(...args);
};

// ── Prevent MySQL pool connections from keeping the event loop alive ──
// This allows Jest to exit gracefully without --forceExit (no open handles).
try {
  const { pool } = require("../Middleware/Database.config");
  if (pool && pool.pool) {
    const bp = pool.pool;
    // Unref the idle-timeout timer so it doesn't block exit
    if (bp._removeIdleTimeoutConnectionsTimer) {
      bp._removeIdleTimeoutConnectionsTimer.unref();
    }
    // Unref existing connections so their TCP sockets don't block exit
    const unrefConn = (c) => {
      try {
        if (c.connection && c.connection.stream) {
          c.connection.stream.unref();
        } else if (c.stream) {
          c.stream.unref();
        }
      } catch {}
    };
    for (let i = 0; i < bp._allConnections.length; i++) {
      unrefConn(bp._allConnections.get(i));
    }
    for (let i = 0; i < bp._freeConnections.length; i++) {
      unrefConn(bp._freeConnections.get(i));
    }
    // Unref new connections as they're created
    pool.on("connection", unrefConn);
  }
} catch {
  // pool not available
}
