const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// ── Silence winston BEFORE any app modules load ──
const logger = require("../Utils/logger");
logger.silent = true;
logger.transports.forEach((t) => {
  t.silent = true;
});
