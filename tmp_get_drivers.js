/* eslint-disable no-console */
const { pool } = require("./Middleware/Database.config");

async function test() {
  const dbClient = await pool.getConnection();

  const [drivers] = await dbClient.query(`
        SELECT u.userUniqueId, ur.roleId, cm.companyUniqueId 
        FROM Users u
        JOIN UserRole ur ON u.userUniqueId = ur.userUniqueId
        LEFT JOIN CompanyMembership cm ON u.userUniqueId = cm.userUniqueId
        WHERE ur.roleId = 2
    `);
    
  const [vehicles] = await dbClient.query(`
        SELECT v.vehicleUniqueId, v.vehicleTypeUniqueId
        FROM Vehicle v
    `);
    
  console.log("Drivers:", drivers.length);
  console.log("Vehicles:", vehicles.length);
  if(drivers.length > 0) {console.dir(drivers, {depth: null});}
    
  dbClient.release();
  process.exit(0);
}

test();
