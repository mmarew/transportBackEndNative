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
  journeyStatusMap,
  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");

const { createVehicleStatusType } = require("../VehicleStatusType.service");

const {
  createUserSystem,
  ensureCredentialForUser,
} = require("../User.service");

const { createStatus } = require("../Status.service");
const { createRole } = require("../Role.service");
const { createRole: createCompanyRole } = require("../CompanyRole.service");

/**
 * Idempotently add ShipperRequest.queueOrganizationUniqueId + its index + FK.
 *
 * The column lives in the ShipperRequest CREATE TABLE (fresh DBs get it for free),
 * but an existing database created before that change has the table WITHOUT the
 * column — so `CREATE TABLE IF NOT EXISTS` is a no-op and a bare ALTER in the DDL
 * fails with ER_KEY_COLUMN_DOES_NOT_EXITS. This runs after the schema inside
 * createTable() and applies only the missing pieces, checked via information_schema.
 */
const ensureQueueOrgReferences = async (connection) => {
  const dbName = dbConfig.database;

  const [colRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'ShipperRequest' AND column_name = 'queueOrganizationUniqueId'`,
    [dbName],
  );
  if (colRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE ShipperRequest
       ADD COLUMN queueOrganizationUniqueId VARCHAR(36) NULL DEFAULT NULL`,
    );
    logger.info("Migration: added ShipperRequest.queueOrganizationUniqueId column");
  }

  const [idxRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'ShipperRequest' AND index_name = 'idx_shipperRequest_queueOrg'`,
    [dbName],
  );
  if (idxRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE ShipperRequest
       ADD INDEX idx_shipperRequest_queueOrg (queueOrganizationUniqueId)`,
    );
    logger.info("Migration: added index idx_shipperRequest_queueOrg");
  }

  const [fkRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.referential_constraints
     WHERE constraint_schema = ? AND constraint_name = 'fk_shipperRequest_queueOrg'`,
    [dbName],
  );
  if (fkRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE ShipperRequest
       ADD CONSTRAINT fk_shipperRequest_queueOrg
       FOREIGN KEY (queueOrganizationUniqueId) REFERENCES QueueOrganization(queueOrganizationUniqueId)`,
    );
    logger.info("Migration: added FK fk_shipperRequest_queueOrg");
  }
};

/**
 * Idempotently enforce "one active request per driver" at the DB level.
 *
 * Adds a STORED generated column `activeRequestGuard` to DriverRequest that is
 * 1 while the request is active (statuses 1-5) and NULL once terminal, plus a
 * UNIQUE index on (userUniqueId, activeRequestGuard). Since NULLs never collide
 * in a unique index, a driver can NEVER hold two active requests — even when two
 * API calls (e.g. go-online + accept) race at the exact same millisecond.
 *
 * Before adding the index, any pre-existing duplicate active requests are
 * neutralised by keeping the highest-priority one per driver and cancelling the
 * rest, so the ALTER TABLE cannot fail on historical bad data.
 */
const ensureDriverActiveRequestGuard = async (connection) => {
  const dbName = dbConfig.database;

  const [idxRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'DriverRequest' AND index_name = 'uq_driver_active_request'`,
    [dbName],
  );
  if (idxRows[0].cnt > 0) {
    return; // Already enforced — nothing to do
  }

  const activeStatuses = activeJourneyStatuses.join(", ");

  // 1) Neutralise existing duplicate active requests before creating the index.
  //    Keep the highest-priority request per driver, cancel the rest.
  const [rows] = await connection.query(
    `SELECT userUniqueId, driverRequestId, journeyStatusId
     FROM DriverRequest
     WHERE journeyStatusId IN (${activeStatuses})
     ORDER BY userUniqueId,
       CASE journeyStatusId
         WHEN ${journeyStatusMap.journeyStarted} THEN 100
         WHEN ${journeyStatusMap.acceptedByShipper} THEN 90
         WHEN ${journeyStatusMap.acceptedByDriver} THEN 70
         WHEN ${journeyStatusMap.requested} THEN 60
         WHEN ${journeyStatusMap.waiting} THEN 10
         ELSE 0
       END DESC,
       driverRequestId DESC`,
  );

  const seen = new Set();
  const toCancel = [];
  for (const row of rows) {
    if (seen.has(row.userUniqueId)) {
      toCancel.push(row.driverRequestId);
    } else {
      seen.add(row.userUniqueId);
    }
  }

  if (toCancel.length > 0) {
    const placeholders = toCancel.map(() => "?").join(", ");
    await connection.query(
      `UPDATE DriverRequest
       SET journeyStatusId = ?, driverRequestUpdatedAt = ?
       WHERE driverRequestId IN (${placeholders})`,
      [journeyStatusMap.cancelledBySystem, currentDate(), ...toCancel],
    );
    logger.info(
      `Migration: cancelled ${toCancel.length} duplicate active driver request(s)`,
    );
  }

  // 2) Add the generated guard column (if not already present).
  const [colRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'DriverRequest' AND column_name = 'activeRequestGuard'`,
    [dbName],
  );
  if (colRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE DriverRequest
       ADD COLUMN activeRequestGuard TINYINT GENERATED ALWAYS AS (
         IF(journeyStatusId IN (${activeStatuses}), 1, NULL)
       ) STORED`,
    );
    logger.info("Migration: added DriverRequest.activeRequestGuard column");
  }

  // 3) Add the unique index enforcing one active request per driver.
  await connection.query(
    `ALTER TABLE DriverRequest
     ADD UNIQUE INDEX uq_driver_active_request (userUniqueId, activeRequestGuard)`,
  );
  logger.info("Migration: added unique index uq_driver_active_request");
};

// Enforcement columns added to DeliveryConfirmations for the POD credibility
// flow (settle hash, two signatures, declaration statement, Tier-A OTP). They
// live in the CREATE TABLE so fresh DBs get them for free, but an existing
// database created before this change lacks them — `CREATE TABLE IF NOT EXISTS`
// is a no-op there, so each missing column is ALTERed in after checking
// information_schema (same pattern as ensureQueueOrgReferences).
const DELIVERY_CONFIRMATION_COLUMNS = [
  { name: "deliveryConfirmationSignatureHash", ddl: "VARCHAR(64) NULL" },
  { name: "deliveryConfirmationPreviousHash", ddl: "VARCHAR(64) NULL" },
  { name: "deliveryConfirmationStatement", ddl: "TEXT NULL" },
  { name: "deliveryConfirmationShipperSignature", ddl: "TEXT NULL" },
  { name: "deliveryConfirmationShipperSignedAt", ddl: "DATETIME NULL" },
  { name: "deliveryConfirmationDriverSignedAt", ddl: "DATETIME NULL" },
  { name: "deliveryConfirmationOtpHash", ddl: "VARCHAR(100) NULL" },
  { name: "deliveryConfirmationOtpExpiresAt", ddl: "DATETIME NULL" },
  { name: "deliveryConfirmationOtpAttempts", ddl: "INT NOT NULL DEFAULT 0" },
  { name: "deliveryConfirmationOtpVerifiedAt", ddl: "DATETIME NULL" },
  { name: "deliveryConfirmationOtpRequestCount", ddl: "INT NOT NULL DEFAULT 0" },
  { name: "deliveryConfirmationOtpWindowStartAt", ddl: "DATETIME NULL" },
];

const ensureDeliveryConfirmationColumns = async (connection) => {
  const dbName = dbConfig.database;

  const [existingRows] = await connection.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'DeliveryConfirmations'`,
    [dbName],
  );
  // MySQL may return the column label as `column_name` or `COLUMN_NAME`
  // depending on the server/client — compare case-insensitively so an existing
  // table is detected correctly and ALTERs are skipped (no ER_DUP_FIELDNAME).
  const existing = new Set(
    existingRows.map((r) =>
      String(r.column_name ?? r.COLUMN_NAME ?? "").toLowerCase(),
    ),
  );

  for (const col of DELIVERY_CONFIRMATION_COLUMNS) {
    if (!existing.has(col.name.toLowerCase())) {
      await connection.query(
        `ALTER TABLE DeliveryConfirmations ADD COLUMN \`${col.name}\` ${col.ddl}`,
      );
      logger.info(`Migration: added DeliveryConfirmations.${col.name} column`);
    }
  }
};

// Who attached each POD photo (the driver, the shipper, or a shipper delegate).
// Tracking this lets the review cards show "photo added by …". Idempotent,
// case-insensitive information_schema check — same pattern as
// ensureDeliveryConfirmationColumns.
const DELIVERY_CONFIRMATION_PHOTO_ATTACHED_BY_COLUMN = {
  name: "deliveryConfirmationPhotoAttachedByUserUniqueId",
  ddl: "VARCHAR(36) NULL",
};

const ensureDeliveryConfirmationPhotoAttachedBy = async (connection) => {
  const dbName = dbConfig.database;

  const [existingRows] = await connection.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'DeliveryConfirmationPhotos'`,
    [dbName],
  );
  const existing = new Set(
    existingRows.map((r) =>
      String(r.column_name ?? r.COLUMN_NAME ?? "").toLowerCase(),
    ),
  );
  const col = DELIVERY_CONFIRMATION_PHOTO_ATTACHED_BY_COLUMN;
  if (!existing.has(col.name.toLowerCase())) {
    await connection.query(
      `ALTER TABLE DeliveryConfirmationPhotos ADD COLUMN \`${col.name}\` ${col.ddl}`,
    );
    logger.info(`Migration: added DeliveryConfirmationPhotos.${col.name} column`);
  }
};

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

    // Idempotently add ShipperRequest.queueOrganizationUniqueId index + FK (see
    // ensureQueueOrgReferences). Must run while this connection still has the DB selected.
    await ensureQueueOrgReferences(adminConnection);

    // Idempotently enforce "one active request per driver" at the DB level
    // (see ensureDriverActiveRequestGuard). Must run while this connection still
    // has the DB selected.
    await ensureDriverActiveRequestGuard(adminConnection);

    // Idempotently add the DeliveryConfirmations enforcement columns (settle
    // hash, two signatures, statement, Tier-A OTP) — see
    // ensureDeliveryConfirmationColumns. Must run while this connection still has
    // the DB selected.
    await ensureDeliveryConfirmationColumns(adminConnection);

    // Idempotently add who-attached attribution on POD photos — see
    // ensureDeliveryConfirmationPhotoAttachedBy. Must run while this connection
    // still has the DB selected.
    await ensureDeliveryConfirmationPhotoAttachedBy(adminConnection);
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
  const isSeedSkip = (error) => {
    const message = error?.message || "";
    return /already exists|duplicate entry/i.test(message);
  };
  for (const status of statusList) {
    try {
      await createStatus({
        ...status,
        user: adminUser,
      });
    } catch (error) {
      if (!isSeedSkip(error)) {
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
      if (!isSeedSkip(error)) {
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
      if (!isSeedSkip(error)) {
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
      if (!isSeedSkip(error)) {
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
  // Safety guard: dont comment this return block. it will distroy the whole database
  return {
    message: "success",
    data: "All tables dropped successfully",
  };
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
        throw new AppError("Failed to drop all tables after 3 attempts", AppError.INTERNAL_SERVER_ERROR);
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
    const constraintName = `fk_${tableName}_${columnName}`.substring(0, 64); // eslint-disable-line no-magic-numbers -- MySQL identifier max length
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
  ensureDriverActiveRequestGuard,
  ensureDeliveryConfirmationColumns,
  ensureDeliveryConfirmationPhotoAttachedBy,
  DELIVERY_CONFIRMATION_COLUMNS,
};
