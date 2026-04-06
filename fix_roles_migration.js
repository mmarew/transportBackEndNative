const mysql = require("mysql2/promise");
const { companyRoles, companyRoleList } = require("./Utils/ListOfSeedData");

const config = {
  host: "localhost",
  user: "root",
  password: "root", // MAMP default
  database: "transport",
  port: 8888,
  socketPath: "/Applications/MAMP/tmp/mysql/mysql.sock",
};

const fakeMapping = {
  "company-role-owner-uuid-static": "57898801-e280-4020-9178-f5122fe6bec9",
  "company-role-manager-uuid-static": "57e8b851-dceb-4423-99e0-eb9b2b4f9d81",
  "company-role-dispatcher-uuid-static": "750858d6-e816-45b0-a088-9dfe6b4d80ff",
  "company-role-driver-uuid-static": "b7ab7faa-0c76-45e2-a973-ecf4478e9ece",
};

async function fixRolesAndMigrate() {
  console.log("Starting roles cleanup and migration...");
  const pool = mysql.createPool(config);
  try {
    await pool.query("SET FOREIGN_KEY_CHECKS = 0");
    console.log("Foreign key checks disabled.");

    // Update the IDs in the master table
    for (const [oldFakeId, newId] of Object.entries(fakeMapping)) {
      console.log(`Updating role ID from ${oldFakeId} to ${newId}...`);
      
      // Update CompanyRoles
      await pool.query(
        "UPDATE CompanyRoles SET companyRoleUniqueId = ? WHERE companyRoleUniqueId = ?",
        [newId, oldFakeId]
      );

      // Update CompanyMembership
      const [res] = await pool.query(
        "UPDATE CompanyMembership SET companyRoleUniqueId = ? WHERE companyRoleUniqueId = ?",
        [newId, oldFakeId]
      );
      console.log(`- Migrated ${res.affectedRows} memberships.`);
    }

    await pool.query("SET FOREIGN_KEY_CHECKS = 1");
    console.log("Foreign key checks enabled.");
    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:");
    console.error(error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

fixRolesAndMigrate();
