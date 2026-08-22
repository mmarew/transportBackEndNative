"use strict";

/**
 * ONE-TIME backfill: mark all old, completed journeys (that have no delivery
 * confirmation at all) as CONFIRMED, so they stop appearing in
 * `GET /api/journey/pod-status?podStatus=NONE`.
 *
 * For each completed journey without a delivery confirmation it inserts a
 * CONFIRMED record: receiver = the journey's shipper, condition GOOD, no
 * photo/GPS/signature image (same "shipper-attested" posture the backend allows
 * for shipper-direct PODs), with a proper SHA-256 hash so admin
 * verify-hash works.
 *
 * It is idempotent — re-running only fills journeys still lacking a POD.
 *
 * Usage (from the repo root, with the live DB env loaded):
 *   node scripts/backfill-pod-confirmed.js [dryRun]
 *   # add the literal arg dryRun to preview without writing
 */

require("dotenv").config();
const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

const DRY_RUN = process.argv.includes("dryRun");
const backfillReason = "system-backfill-history";
// The account that authored these historical records (a shipper/marker string).
// FK integrity requires a real userUniqueId, so we resolve the shipper and use
// them as createdBy/confirmedBy (they are the shipper of that journey).
const canonicalInput = (f) =>
  [
    f.journeyUniqueId,
    f.driverSignature || "",
    f.shipperSignature || "",
    f.photoUrls ? [...f.photoUrls].sort().join(",") : "",
    f.deliveredQuantity ?? "",
    f.quantityUnit || "",
    f.condition || "",
    f.latitude ?? "",
    f.longitude ?? "",
    f.confirmedAt || "",
  ].join("|");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

const completedStatuses = [
  Number(journeyStatusMap.journeyCompleted), // 9
  Number(journeyStatusMap.completedByAdmin), // 14
];

async function run() {
  const conn = await pool.getConnection();
  try {
    const [missing] = await conn.query(
      `SELECT
         j.journeyUniqueId,
         j.journeyStatusId,
         j.journeyId,
         sr.userUniqueId AS shipperUserUniqueId,
         sr.shippableItemQtyInQuintal,
         sr.shippableItemName
       FROM Journey j
       INNER JOIN JourneyDecisions jd ON jd.journeyDecisionUniqueId = j.journeyDecisionUniqueId
       INNER JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       LEFT JOIN DeliveryConfirmations dc ON dc.journeyUniqueId = j.journeyUniqueId
       WHERE j.journeyDeletedAt IS NULL
         AND dc.deliveryConfirmationUniqueId IS NULL
         AND j.journeyStatusId IN (?, ?)
       ORDER BY j.journeyId ASC`,
      completedStatuses,
    );

    console.log(
      `[pod-backfill] found ${missing.length} completed journeys without a POD ` +
        `(dryRun=${DRY_RUN})`,
    );

    let created = 0;
    for (const m of missing) {
      const now = new Date();
      const nowSql = now.toISOString().slice(0, 19).replace("T", " ");
      const deliveryConfirmationUniqueId = uuidv4();
      const signature = backfillReason;
      // Match the DECIMAL column types used by the create path.
      const quantity = m.shippableItemQtyInQuintal ?? null;

      const hash = sha256(
        canonicalInput({
          journeyUniqueId: m.journeyUniqueId,
          driverSignature: "",
          shipperSignature: signature,
          photoUrls: [],
          deliveredQuantity: quantity,
          quantityUnit: "",
          condition: "GOOD",
          latitude: null,
          longitude: null,
          confirmedAt: nowSql,
        }),
      );

      if (DRY_RUN) {
        console.log(
          `  [dry] would CONFIRM journey ${m.journeyUniqueId} ` +
            `(shipper ${m.shipperUserUniqueId})`,
        );
        created += 1;
        continue;
      }

      await conn.query(
        `INSERT INTO DeliveryConfirmations (
           deliveryConfirmationUniqueId,
           journeyUniqueId,
           receiverUserUniqueId,
           confirmedByUserUniqueId,
           deliveryConfirmationStatus,
           deliveryConfirmationDeliveredQuantity,
           deliveryConfirmationQuantityUnit,
           deliveryConfirmationCondition,
           deliveryConfirmationShipperSignature,
           deliveryConfirmationShipperSignedAt,
           deliveryConfirmationStatement,
           deliveryConfirmationSignatureHash,
           deliveryConfirmationSubmittedAt,
           deliveryConfirmationCreatedBy,
           deliveryConfirmationConfirmedAt,
           deliveryConfirmationCreatedAt,
           deliveryConfirmationUpdatedAt
         ) VALUES (?, ?, ?, ?, 'CONFIRMED', ?, NULL, 'GOOD', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          deliveryConfirmationUniqueId,
          m.journeyUniqueId,
          m.shipperUserUniqueId,
          m.shipperUserUniqueId,
          quantity,
          signature,
          nowSql,
          "Historical delivery marked confirmed by system backfill.",
          hash,
          nowSql,
          m.shipperUserUniqueId,
          nowSql,
          nowSql,
          nowSql,
        ],
      );
      created += 1;
    }

    console.log(`[pod-backfill] done. records affected: ${created}`);
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("[pod-backfill] failed:", err.message);
  process.exitCode = 1;
});
