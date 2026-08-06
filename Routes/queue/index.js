"use strict";

// Queue-dispatch routes. Mounted from Routes/index.js:
//   { path: "/api/queueOrganization", handler: queueOrganizationRoutes }
//   { path: "/api/queue",             handler: driverQueueRoutes }

const queueOrganizationRoutes = require("./QueueOrganization.routes");
const driverQueueRoutes = require("./DriverQueue.routes");

module.exports = { queueOrganizationRoutes, driverQueueRoutes };
