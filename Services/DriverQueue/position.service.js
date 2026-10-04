"use strict";

// Barrel for the four driver-facing queue read/write endpoints.
//
// Split out of a single 625-line `position.service.js` (which exceeded the
// 500-line `max-lines` budget) into one concern per file, following the
// convention set by commit f1869e65. Bodies are unchanged — this file only
// re-exports, so every existing importer of `./position.service` keeps working
// and `Services/DriverQueue/index.js` still spreads this module unchanged.
//
//   myPosition    -> myPosition.service.js    GET  /api/queue/driver/myPosition
//   yardPass      -> yardPass.service.js      POST /api/queue/driver/yardPass
//   checkout      -> checkout.service.js      POST /api/queue/driver/checkout
//   getQueueStatus-> queueStatus.service.js   GET  /api/queue/status
module.exports = {
  ...require("./myPosition.service"),
  ...require("./yardPass.service"),
  ...require("./checkout.service"),
  ...require("./queueStatus.service"),
};