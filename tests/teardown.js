const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

module.exports = async () => {
  try {
    const { pool } = require("../Middleware/Database.config");
    if (pool) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await pool.end();
    }
  } catch {
    /* best-effort */
  }
};
