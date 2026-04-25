const { pool } = require("./Middleware/Database.config");
const { companyRoles } = require("./Utils/ListOfSeedData");

async function migrateMembershipRoles() {
  console.log("Starting CompanyMembership migration...");
  try {
    // 1. Add the new column
    console.log("Adding companyRoleUniqueId column...");
    await pool.query(`
      ALTER TABLE CompanyMembership 
      ADD COLUMN companyRoleUniqueId VARCHAR(36) AFTER userUniqueId
    `);

    // 2. Map existing ENUM values to new UUIDs
    console.log("Mapping existing ENUM values to UUIDs...");
    const mapping = {
      "owner": companyRoles.ownerUniqueId,
      "manager": companyRoles.managerUniqueId,
      "dispatcher": companyRoles.dispatcherUniqueId,
      "driver": companyRoles.driverUniqueId
    };

    for (const [roleName, roleUuid] of Object.entries(mapping)) {
      await pool.query(
        "UPDATE CompanyMembership SET companyRoleUniqueId = ? WHERE membershipRole = ?",
        [roleUuid, roleName]
      );
      console.log(`- Migrated ${roleName} members.`);
    }

    // 3. Cleanup: Drop old column and add constraints
    console.log("Cleaning up old schema...");
    await pool.query("ALTER TABLE CompanyMembership DROP COLUMN membershipRole");
    await pool.query("ALTER TABLE CompanyMembership MODIFY COLUMN companyRoleUniqueId VARCHAR(36) NOT NULL");
    await pool.query("ALTER TABLE CompanyMembership ADD INDEX idx_membership_role (companyRoleUniqueId)");
    await pool.query("ALTER TABLE CompanyMembership ADD FOREIGN KEY (companyRoleUniqueId) REFERENCES CompanyRoles(companyRoleUniqueId)");

    console.log("Migration completed successfully.");
  } catch (error) {
    console.error("Migration failed:");
    console.error(error);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

migrateMembershipRoles();
