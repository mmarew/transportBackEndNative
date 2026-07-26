"use strict";

const Config = require("../../Utils/Config");
const { sqlQuery } = require("../../Database/Database");
const { pool, config: dbConfig } = require("../../Middleware/Database.config");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const logger = require("../../Utils/logger");
const mysql = require("mysql2/promise");
const { v4: uuidv4 } = require("uuid");
const {
  statusList,
  roleList,

  listOfVehicleStatusTypes,

  companyRoleList,
} = require("../../Utils/ListOfSeedData");

const { createVehicleStatusType } = require("../VehicleStatusType.service");

const {
  createUserSystem,
  ensureCredentialForUser,
} = require("../User.service");

const { createStatus } = require("../Status.service");
const { createRole } = require("../Role.service");
const { createRole: createCompanyRole } = require("../CompanyRole.service");

const createTable = async () => {
  // Connect WITHOUT specifying the database so we can create it if it doesn't exist.
  const { database: dbName, ...configWithoutDb } = dbConfig;
  const adminConnection = await mysql.createConnection({
    ...configWithoutDb,
    multipleStatements: true,
  });
  try {
    // Create the database if it doesn't already exist
    await adminConnection.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    logger.info(`Database '${dbName}' ensured (created if not existed)`);

    // Select the database before running the schema DDL
    await adminConnection.query(`USE \`${dbName}\``);

    // Run the full schema (all CREATE TABLE IF NOT EXISTS statements)
    await adminConnection.query(sqlQuery);
  } finally {
    await adminConnection.end();
  }

  // Insert Super Admin user first (minimal Users row) to use as createdBy for seeding
  const superAdminId = uuidv4();
  const superAdminFullName = Config.SUPER_ADMIN.FULL_NAME;
  const superAdminPhone = Config.SUPER_ADMIN.PHONE;
  const superAdminEmail = Config.SUPER_ADMIN.EMAIL;
  await pool.query(
    `INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, userCreatedAt, userCreatedBy)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE fullName=VALUES(fullName), phoneNumber=VALUES(phoneNumber), email=VALUES(email)`,
    [
      superAdminId,
      superAdminFullName,
      superAdminPhone,
      superAdminEmail,
      currentDate(),
      superAdminId,
    ],
  );
  // Resolve the actual super admin userUniqueId in DB (handles duplicates on phone/email)
  const [superRows] = await pool.query(
    `SELECT userUniqueId FROM Users WHERE email = ? OR phoneNumber = ? LIMIT 1`,
    [superAdminEmail, superAdminPhone],
  );
  const effectiveSuperAdminId = superRows?.[0]?.userUniqueId || superAdminId;
  await ensureCredentialForUser({
    userUniqueId: effectiveSuperAdminId,
    rawPassword: Config.SUPER_ADMIN.TEMP_PASSWORD,
  });
  const adminUser = {
    userUniqueId: effectiveSuperAdminId,
  };

  // Seed Statuses first to satisfy FK constraints for UserRoleStatusCurrent
  for (const status of statusList) {
    try {
      await createStatus({
        ...status,
        user: adminUser,
      });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        logger.error(`Error seeding status ${status.statusName}:`, error);
      }
    }
  }

  // Seed Roles to satisfy FK constraints for UserRole
  for (const role of roleList) {
    try {
      await createRole({
        ...role,
        user: adminUser,
      });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        logger.error(`Error seeding role ${role.roleName}:`, error);
      }
    }
  }

  // Seed VehicleStatusTypes (e.g. for VehicleStatus FK)
  for (const vehicleStatusType of listOfVehicleStatusTypes) {
    try {
      await createVehicleStatusType({
        ...vehicleStatusType,
        user: adminUser,
      });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        logger.error(
          `Error seeding vehicle status type ${vehicleStatusType.VehicleStatusTypeName}:`,
          error,
        );
      }
    }
  }

  // Seed CompanyRoles (Required for company creation)
  for (const companyRole of companyRoleList) {
    try {
      await createCompanyRole({
        ...companyRole,
        userUniqueId: effectiveSuperAdminId,
      });
    } catch (error) {
      if (!error.message || !error.message.includes("already exists")) {
        logger.error(
          `Error seeding company role ${companyRole.companyRoleName}:`,
          error,
        );
      }
    }
  }

  // Now create system and super admin users (relies on Roles existing)
  await createUserSystem();
  return {
    message: `Tables created successfully`,
    data: null,
  };
};

const dropTable = async (tables) => {
  const tableList = Array.isArray(tables) ? tables : [tables];
  try {
    await pool.query(`SET FOREIGN_KEY_CHECKS = 0;`);
    for (const table of tableList) {
      const sqlQuery = `DROP TABLE IF EXISTS \`${table}\`;`;
      await pool.query(sqlQuery);
      const tableExists = await checkTableExists(table);
      if (tableExists) {
        throw new Error(`Table ${table} still exists after drop attempt.`);
      }
    }
    return {
      message: `Table(s) [${tableList.join(", ")}] dropped successfully`,
      data: null,
    };
  } finally {
    await pool.query(`SET FOREIGN_KEY_CHECKS = 1;`);
  }
};

const dropAllTables = async () => {
  // Safety guard: uncomment the code below if you truly need to drop all tables.
  // return {
  //   message: "success",
  //   data: "All tables dropped successfully",
  // };
  const disableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 0;`;
  const enableForeignKeyChecks = `SET FOREIGN_KEY_CHECKS = 1;`;
  const maxRetries = 3;
  try {
    await pool.query(disableForeignKeyChecks);
    const sqlQuery = `SHOW TABLES`;
    const [tables] = await pool.query(sqlQuery);
    const tableNames = tables.map((table) => Object.values(table)[0]);
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const remainingTables = [];
      for (const tableName of tableNames) {
        const sqlToDropTable = `DROP TABLE IF EXISTS \`${tableName}\``;
        try {
          await pool.query(sqlToDropTable);
          logger.info(`Table dropped: ${tableName}`);
        } catch (error) {
          if (error.code === "ER_ROW_IS_REFERENCED_2") {
            remainingTables.push(tableName);
            logger.warn(`Table referenced, skipping for now: ${tableName}`);
          } else {
            logger.error(`Error dropping table ${tableName}: ${error.message}`);
          }
        }
      }
      if (remainingTables.length === 0) {
        logger.info("All tables dropped successfully");
        break;
      }
      if (attempt === maxRetries && remainingTables.length > 0) {
        throw new AppError("Failed to drop all tables after 3 attempts", 500);
      }
    }
    return {
      message: "All tables dropped",
      data: null,
    };
  } finally {
    await pool.query(enableForeignKeyChecks);
  }
};

const updateTable = async (tableName, updateData) => {
  const { columnName, columnType, defaultValue, foreignKey } = updateData;

  // 1. Add the column itself
  const addColumnSql = `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnType} DEFAULT ${defaultValue}`;
  await pool.query(addColumnSql);

  /**
   * 2. Optionally add a Foreign Key constraint.
   * We run this as a SEPARATE ALTER TABLE because MySQL does not allow
   * ADD COLUMN and ADD FOREIGN KEY in a single statement reliably.
   *
   * Expected foreignKey shape:
   * {
   *   "references": {
   *     "table": "CompanyBidRequest",
   *     "column": "companyBidRequestUniqueId"
   *   }
   * }
   * Note: the FK column is always the same as columnName — no need to repeat it.
   */
  if (foreignKey && foreignKey.references) {
    const { references } = foreignKey;
    const constraintName = `fk_${tableName}_${columnName}`.substring(0, 64);
    const addFkSql = `ALTER TABLE \`${tableName}\`
      ADD CONSTRAINT \`${constraintName}\`
      FOREIGN KEY (\`${columnName}\`)
      REFERENCES \`${references.table}\` (\`${references.column}\`)`;
    await pool.query(addFkSql);
  }
  return {
    message: `Table ${tableName} updated successfully${foreignKey ? ` with FK on ${columnName}` : ""}`,
    data: null,
  };
};

const checkTableExists = async (tableName) => {
  const sqlQuery = `
    SELECT COUNT(*) AS tableExists 
    FROM information_schema.tables 
    WHERE table_schema = DATABASE() 
    AND table_name = ?;
  `;
  const [rows] = await pool.query(sqlQuery, [tableName]);
  return rows[0].tableExists > 0;
};

module.exports = {
  createTable,
  dropTable,
  dropAllTables,
  updateTable,
  checkTableExists,
};
