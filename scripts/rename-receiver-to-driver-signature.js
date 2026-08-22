/**
 * Migration: Rename receiver → driver signature columns
 *
 * deliveryConfirmationReceiverSignature → deliveryConfirmationDriverSignature
 * deliveryConfirmationReceiverSignedAt  → deliveryConfirmationDriverSignedAt
 *
 * The "receiver" in Tier A is actually the driver who delivers and signs on the
 * road. "Receiver" was confusing because the shipper is also a receiver of goods.
 *
 * Safe to run multiple times (idempotent).
 */

const { pool } = require("../Middleware/Database.config");
const logger = require("../Utils/logger");

const RENAMES = [
  {
    old: "deliveryConfirmationReceiverSignature",
    new: "deliveryConfirmationDriverSignature",
  },
  {
    old: "deliveryConfirmationReceiverSignedAt",
    new: "deliveryConfirmationDriverSignedAt",
  },
];

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return rows[0].cnt > 0;
}

async function migrate() {
  const connection = await pool.getConnection();
  try {
    for (const { old: oldCol, new: newCol } of RENAMES) {
      const exists = await columnExists(connection, "DeliveryConfirmations", oldCol);
      if (!exists) {
        logger.info(`Column ${oldCol} does not exist — skipping`);
        continue;
      }
      const alreadyMigrated = await columnExists(
        connection,
        "DeliveryConfirmations",
        newCol,
      );
      if (alreadyMigrated) {
        logger.info(`Column ${newCol} already exists — skipping rename`);
        continue;
      }
      await connection.query(
        `ALTER TABLE DeliveryConfirmations RENAME COLUMN \`${oldCol}\` TO \`${newCol}\``,
      );
      logger.info(`Renamed ${oldCol} → ${newCol}`);
    }
    logger.info("Migration complete: receiver → driver signature columns");
  } finally {
    connection.release();
  }
}

migrate().catch((err) => {
  logger.error("Migration failed", { error: err.message });
  process.exit(1);
});
