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
 * Idempotently enforce the BATCH-canonical queue reference model.
 *
 * queueOrganizationUniqueId lives ONLY on ShipperRequestBatch (DRY) and is
 * inherited by ShipperRequest rows via batch join. The legacy per-row
 * ShipperRequest.queueOrganizationUniqueId column/index/FK no longer exists.
 *
 * The batch column lives in the ShipperRequestBatch CREATE TABLE (fresh DBs get
 * it for free), but an existing database created before that change may lack
 * it, its index, or its FK — so run after the schema inside createTable() and
 * apply only the missing pieces, checked via information_schema. Also safely
 * drops any leftover legacy ShipperRequest queue column/index/FK.
 */
const ensureQueueOrgReferences = async (connection) => {
  const dbName = dbConfig.database;

  // 1. Batch column (canonical). ADD if missing (idempotent).
  const [batchCol] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'ShipperRequestBatch' AND column_name = 'queueOrganizationUniqueId'`,
    [dbName],
  );
  if (batchCol[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE ShipperRequestBatch
       ADD COLUMN queueOrganizationUniqueId VARCHAR(36) NULL DEFAULT NULL`,
    );
    logger.info("Migration: added ShipperRequestBatch.queueOrganizationUniqueId column");
  }

  // 2. Batch index on the canonical column.
  const [idxRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'ShipperRequestBatch' AND index_name = 'idx_batch_queue_org'`,
    [dbName],
  );
  if (idxRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE ShipperRequestBatch
       ADD INDEX idx_batch_queue_org (queueOrganizationUniqueId)`,
    );
    logger.info("Migration: added index idx_batch_queue_org");
  }

  // 3. Batch FK -> QueueOrganization on the canonical column.
  const [fkRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.referential_constraints
     WHERE constraint_schema = ? AND constraint_name = 'fk_ShipperRequestBatch_queueOrganizationUniqueId'`,
    [dbName],
  );
  if (fkRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE ShipperRequestBatch
       ADD CONSTRAINT fk_ShipperRequestBatch_queueOrganizationUniqueId
       FOREIGN KEY (queueOrganizationUniqueId) REFERENCES QueueOrganization(queueOrganizationUniqueId)`,
    );
    logger.info("Migration: added FK fk_ShipperRequestBatch_queueOrganizationUniqueId");
  }

  // 4. Drop any leftover legacy ShipperRequest queue reference, in dependency
  //    order (FK -> index -> column), so the old model can never resurface.
  const [srFk] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.referential_constraints
     WHERE constraint_schema = ? AND constraint_name = 'fk_shipperRequest_queueOrg'`,
    [dbName],
  );
  if (srFk[0].cnt > 0) {
    await connection.query(`ALTER TABLE ShipperRequest DROP FOREIGN KEY fk_shipperRequest_queueOrg`);
    logger.info("Migration: dropped legacy ShipperRequest FK fk_shipperRequest_queueOrg");
  }
  const [srIdx] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'ShipperRequest' AND index_name = 'idx_shipperRequest_queueOrg'`,
    [dbName],
  );
  if (srIdx[0].cnt > 0) {
    await connection.query(`ALTER TABLE ShipperRequest DROP INDEX idx_shipperRequest_queueOrg`);
    logger.info("Migration: dropped legacy ShipperRequest index idx_shipperRequest_queueOrg");
  }
  const [srCol] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'ShipperRequest' AND column_name = 'queueOrganizationUniqueId'`,
    [dbName],
  );
  if (srCol[0].cnt > 0) {
    await connection.query(`ALTER TABLE ShipperRequest DROP COLUMN queueOrganizationUniqueId`);
    logger.info("Migration: dropped legacy ShipperRequest.queueOrganizationUniqueId column");
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

// Make the per-journey DeliveryConfirmations uniqueness LIVE-ONLY.
//
// The original `UNIQUE KEY uqDeliveryConfirmationJourney (journeyUniqueId)`
// binds the key on every row INCLUDING soft-deleted ones. After a confirmation
// is soft-deleted the journey can never get a fresh one — every re-create hits
// ER_DUP_ENTRY against the dead row, and the create service's idempotent
// recovery finds no live row to hand back, so it must throw 409. A delivered
// journey legitimately needs a fresh confirmation once the previous one was
// removed, so the key becomes a generated column that is NULL when the row is
// deleted (MySQL allows many NULLs in a UNIQUE index) and equals the journey id
// while the row is live (at most one live confirmation per journey, enforced by
// the DB — live duplicates are still resolved to the existing row in the
// create service, which keeps the old idempotent behavior).
const ensureDeliveryConfirmationLiveJourneyKey = async (connection) => {
  const dbName = dbConfig.database;

  const [colRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'DeliveryConfirmations' AND column_name = 'liveJourneyKey'`,
    [dbName],
  );
  if (colRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE DeliveryConfirmations
       ADD COLUMN liveJourneyKey VARCHAR(36)
         GENERATED ALWAYS AS (IF(deliveryConfirmationDeletedAt IS NULL, journeyUniqueId, NULL)) STORED,
       ADD UNIQUE KEY uq_deliveryConfirmation_live_journey (liveJourneyKey)`,
    );
    logger.info(
      "Migration: added DeliveryConfirmations.liveJourneyKey (live-only unique) column",
    );
  }

  const [idxRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = 'DeliveryConfirmations' AND index_name = 'uq_deliveryConfirmation_live_journey'`,
    [dbName],
  );
  if (idxRows[0].cnt === 0) {
    await connection.query(
      `ALTER TABLE DeliveryConfirmations
       ADD UNIQUE KEY uq_deliveryConfirmation_live_journey (liveJourneyKey)`,
    );
    logger.info(
      "Migration: added DeliveryConfirmations.uq_deliveryConfirmation_live_journey index",
    );
  }

  // information_schema.statistics can report stale index metadata within the
  // same connection right after an ALTER, so read the index list via SHOW INDEX
  // (engine-backed, always fresh) for the checks below.
  const [showIdx] = await connection.query(
    `SHOW INDEX FROM DeliveryConfirmations`,
  );
  const liveIndexNames = new Set(showIdx.map((r) => String(r.Key_name).toLowerCase()));

  // The legacy unique index backs the journeyUniqueId FK, so it cannot be
  // dropped until a plain index covers that column — otherwise MySQL rejects it
  // with ER_DROP_INDEX_FK ("needed in a foreign key constraint").
  if (!liveIndexNames.has("idx_deliveryconfirmation_journey")) {
    await connection.query(
      `ALTER TABLE DeliveryConfirmations
       ADD INDEX idx_deliveryConfirmation_journey (journeyUniqueId)`,
    );
    logger.info(
      "Migration: added DeliveryConfirmations.idx_deliveryConfirmation_journey index",
    );
  }

  if (liveIndexNames.has("uqdeliveryconfirmationjourney")) {
    await connection.query(
      `ALTER TABLE DeliveryConfirmations DROP INDEX uqDeliveryConfirmationJourney`,
    );
    logger.info(
      "Migration: dropped legacy DeliveryConfirmations.uqDeliveryConfirmationJourney index",
    );
  }
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

// Reconcile CompanyBidRequest's batch-linkage column to the canonical name.
//
// The live schema (Database.js) and all code use `shipperRequestBatchUniqueId`,
// but databases created before that rename still hold the older column
// `shipperRequestBatchId`. Since CREATE TABLE IF NOT EXISTS is a no-op for the
// existing table, any query joining CompanyBidRequest on the canonical name
// fails with `Unknown column 'shipperRequestBatchUniqueId'`. This idempotent
// migration renames the legacy column (preserving existing data) or adds the
// canonical column if it is entirely absent — same pattern as the other
// ensure* helpers.
const ensureCompanyBidRequestBatchColumn = async (connection) => {
  const dbName = dbConfig.database;

  const [existingRows] = await connection.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'CompanyBidRequest'`,
    [dbName],
  );
  const existing = new Set(
    existingRows.map((r) =>
      String(r.column_name ?? r.COLUMN_NAME ?? "").toLowerCase(),
    ),
  );

  const hasCanonical = existing.has("shipperrequestbatchuniqueid");
  const hasLegacy = existing.has("shipperrequestbatchid");

  if (!hasCanonical && hasLegacy) {
    await connection.query(
      `ALTER TABLE CompanyBidRequest
       CHANGE COLUMN \`shipperRequestBatchId\` \`shipperRequestBatchUniqueId\` VARCHAR(36) NOT NULL`,
    );
    logger.info(
      "Migration: renamed CompanyBidRequest.shipperRequestBatchId -> shipperRequestBatchUniqueId",
    );
  } else if (!hasCanonical && !hasLegacy) {
    await connection.query(
      `ALTER TABLE CompanyBidRequest
       ADD COLUMN \`shipperRequestBatchUniqueId\` VARCHAR(36) NOT NULL`,
    );
    logger.info(
      "Migration: added CompanyBidRequest.shipperRequestBatchUniqueId column",
    );
  }
};

// Drop any legacy `shipperRequestBatchId` column left over on tables that now
// carry the canonical `shipperRequestBatchUniqueId`. The old column was NOT NULL
// with no default, so any INSERT that omitted it (e.g. company lazy ShipperRequest
// creation during bid acceptance) failed with "Field 'shipperRequestBatchId'
// doesn't have a default value". Idempotent — only drops when both conditions
// hold (legacy present AND canonical present).
const ensureNoLegacyShipperRequestBatchId = async (connection) => {
  const dbName = dbConfig.database;

  const [rows] = await connection.query(
    `SELECT TABLE_NAME FROM information_schema.COLUMNS
     WHERE table_schema = ? AND table_name = 'ShipperRequest'
       AND column_name = 'shipperRequestBatchId'`,
    [dbName],
  );
  if (rows.length === 0) return;

  const [canonicalRows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE table_schema = ? AND table_name = 'ShipperRequest'
       AND column_name = 'shipperRequestBatchUniqueId'`,
    [dbName],
  );
  if (canonicalRows[0].cnt === 0) return;

  await connection.query(
    `ALTER TABLE ShipperRequest DROP COLUMN \`shipperRequestBatchId\``,
  );
  logger.info(
    "Migration: dropped legacy ShipperRequest.shipperRequestBatchId column",
  );
};

// Reconcile ENUM columns (derived from Database.js) so the live DB's allowed
// value set is never narrower than the schema's. When an old DB lacks a value
// the code now writes (e.g. decisionBy='company', bidStatus='completed') MySQL
// rejects it with "Data truncated for column 'x'". Idempotent ALTER only when a
// schema value is missing from the live enum.
const SCHEMA_ENUM_COLUMNS = {
  "JourneyDecisions.decisionBy": {
    values: ["shipper", "driver", "admin", "queue", "company"],
    modifier: "NOT NULL",
  },
  "CompanyBidRequest.bidStatus": {
    values: [
      "submitted",
      "accepted_by_shipper",
      "rejected_by_shipper",
      "cancelled_by_company",
      "expired",
      "completed",
    ],
    modifier: "NOT NULL DEFAULT 'submitted'",
  },
};

const parseLiveEnum = (columnType) => {
  const matches = String(columnType || "").match(/'([^']*)'/g);
  return matches ? matches.map((m) => m.slice(1, -1)) : [];
};

const ensureSchemaEnums = async (connection) => {
  const dbName = dbConfig.database;

  for (const [key, columnSpec] of Object.entries(SCHEMA_ENUM_COLUMNS)) {
    const { values, modifier = "" } = columnSpec;
    const [tableName, columnName] = key.split(".");
    const [rows] = await connection.query(
      `SELECT COLUMN_TYPE FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
      [dbName, tableName, columnName],
    );
    if (rows.length === 0) continue;

    const liveValues = parseLiveEnum(rows[0].COLUMN_TYPE);
    const missing = values.filter((v) => !liveValues.includes(v));
    if (missing.length === 0) continue;

    // Keep the schema's canonical ordering and append any extras already live.
    const merged = [...values, ...liveValues.filter((v) => !values.includes(v))];
    const enumList = merged.map((v) => `'${v}'`).join(",");
    await connection.query(
      `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ENUM(${enumList}) ${modifier}`.trim(),
    );
    logger.info(
      `Migration: widened ${tableName}.${columnName} enum (added: ${missing.join(", ")})`,
    );
  }
};

// Reconcile any columns that live in Database.js (the schema source of truth)
// but are missing from an existing table in the live DB.
//
// Because CREATE TABLE IF NOT EXISTS is a no-op for tables that already exist,
// columns added to the schema later are never picked up automatically. This
// holds the exact DDL (derived from Database.js) for those columns and, after
// checking information_schema, ALTERs in the missing ones. Idempotent — same
// pattern as the other ensure* helpers. Extend the map whenever the schema
// grows a column that an older DB won't have.
const SCHEMA_GAP_COLUMNS = {
  ShipperRequest: [
    { name: "isPodRequired", ddl: "BOOLEAN NOT NULL DEFAULT TRUE" },
  ],
  ShipperRequestBatch: [
    { name: "isPodRequired", ddl: "BOOLEAN NOT NULL DEFAULT TRUE" },
  ],
  Journey: [
    { name: "journeyGoingToLoadingLat", ddl: "DECIMAL(10, 8) NULL" },
    { name: "journeyGoingToLoadingLng", ddl: "DECIMAL(11, 8) NULL" },
    { name: "journeyGoingToLoadingAt", ddl: "DATETIME NULL" },
    { name: "journeyLoadingStartedLat", ddl: "DECIMAL(10, 8) NULL" },
    { name: "journeyLoadingStartedLng", ddl: "DECIMAL(11, 8) NULL" },
    { name: "loadingStartedAt", ddl: "DATETIME NULL" },
    { name: "journeyLoadingCompletedLat", ddl: "DECIMAL(10, 8) NULL" },
    { name: "journeyLoadingCompletedLng", ddl: "DECIMAL(11, 8) NULL" },
    { name: "loadingCompletedAt", ddl: "DATETIME NULL" },
    { name: "journeyStartedAt", ddl: "DATETIME NULL" },
    { name: "journeyStartedByUser", ddl: "VARCHAR(36) NULL" },
    { name: "journeyCompletedAt", ddl: "DATETIME NULL" },
    { name: "journeyCompletedByUser", ddl: "VARCHAR(36) NULL" },
    { name: "journeyProofOfLoading", ddl: "TEXT NULL" },
  ],
};

const ensureSchemaColumnCompleteness = async (connection) => {
  const dbName = dbConfig.database;

  for (const [tableName, columns] of Object.entries(SCHEMA_GAP_COLUMNS)) {
    const [tableRows] = await connection.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables
       WHERE table_schema = ? AND table_name = ?`,
      [dbName, tableName],
    );
    if (tableRows[0].cnt === 0) continue; // table not created yet — skip

    const [existingRows] = await connection.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ?`,
      [dbName, tableName],
    );
    const existing = new Set(
      existingRows.map((r) =>
        String(r.column_name ?? r.COLUMN_NAME ?? "").toLowerCase(),
      ),
    );

    for (const col of columns) {
      if (existing.has(col.name.toLowerCase())) continue;
      await connection.query(
        `ALTER TABLE \`${tableName}\` ADD COLUMN \`${col.name}\` ${col.ddl}`,
      );
      logger.info(`Migration: added ${tableName}.${col.name} column`);
    }
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

    // Idempotently enforce the BATCH-canonical queueOrganizationUniqueId model
    // (see ensureQueueOrgReferences). Must run while this connection still has the DB selected.
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

    // Idempotently make the per-journey DeliveryConfirmations uniqueness
    // live-only (generated column) so a soft-deleted confirmation no longer
    // blocks re-creating one for the same journey — see
    // ensureDeliveryConfirmationLiveJourneyKey.
    await ensureDeliveryConfirmationLiveJourneyKey(adminConnection);

    // Idempotently reconcile CompanyBidRequest's batch-linkage column to the
    // canonical shipperRequestBatchUniqueId (rename/add) — must run while this
    // connection still has the DB selected.
    await ensureCompanyBidRequestBatchColumn(adminConnection);

    // Idempotently add any Database.js schema columns missing from existing
    // tables (isPodRequired on ShipperRequest/Batch, Journey stage-columns).
    await ensureSchemaColumnCompleteness(adminConnection);

    // Idempotently drop the legacy ShipperRequest.shipperRequestBatchId column
    // left over from before the shipperRequestBatchUniqueId rename.
    await ensureNoLegacyShipperRequestBatchId(adminConnection);

    // Idempotently widen any ENUM columns whose schema value-set grew (e.g.
    // decisionBy gained 'queue'/'company', bidStatus gained 'completed').
    await ensureSchemaEnums(adminConnection);
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
  ensureCompanyBidRequestBatchColumn,
  ensureSchemaColumnCompleteness,
  ensureNoLegacyShipperRequestBatchId,
  ensureSchemaEnums,
  DELIVERY_CONFIRMATION_COLUMNS,
};
