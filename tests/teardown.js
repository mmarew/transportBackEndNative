const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

module.exports = async () => {
  try {
    const { pool } = require("../Middleware/Database.config");
    if (pool) {
      await new Promise((r) => setTimeout(r, 200));
      await pool.end();
    }
  } catch (_) {
    /* best-effort */
  }
};
