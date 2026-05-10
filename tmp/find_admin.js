/* eslint-disable no-console */
const { pool } = require("./Middleware/Database.config");

(async () => {
  try {
    const [rows] = await pool.query(
      `SELECT u.phoneNumber FROM Users u 
       JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId 
       WHERE ur.roleId = 6 LIMIT 1`
    );
    console.log("SUPER_ADMIN_PHONE:", rows[0]?.phoneNumber);
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
