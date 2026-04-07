const { pool } = require("../Middleware/Database.config");

(async () => {
  try {
    const [users] = await pool.query(
      `SELECT u.phoneNumber, ur.roleId, r.roleName 
       FROM Users u 
       JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId 
       JOIN Roles r ON ur.roleId = r.roleId`
    );
    console.log("USERS_AND_ROLES:", JSON.stringify(users, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
