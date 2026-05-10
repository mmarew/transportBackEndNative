/* eslint-disable no-console */
const { pool } = require("../Middleware/Database.config");

(async () => {
  try {
    const [rows] = await pool.query(
      `SELECT ur.*, ursc.statusId 
       FROM UserRole ur 
       LEFT JOIN UserRoleStatusCurrent ursc ON ur.userRoleId = ursc.userRoleId 
       JOIN Users u ON ur.userUniqueId = u.userUniqueId 
       WHERE u.phoneNumber = '+251983222221' AND ur.roleId = 6`
    );
    console.log("SUPER_ADMIN_DETAILS:", JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
