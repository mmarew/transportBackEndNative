"use strict";

const { pool } = require("../../Middleware/Database.config");
const { createJourney } = require("./journeyCreate.service");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");

// Completed statuses that must have (or can have) a Journey row. A completed
// decision whose Journey row is missing is treated as repairable.
const completedStatuses = [
  Number(journeyStatusMap.journeyCompleted), // 9
  Number(journeyStatusMap.completedByAdmin), // 14
];

const completedStatusPlaceholders = completedStatuses
  .map(() => "?")
  .join(", ");

// Load every record needed to faithfully rebuild one Journey row for a
// completed decision: the decision itself, its shipper/driver requests (for
// origin/destination + audit), and its recorded route points (for GPS +
// timestamps). Returns null when the decision is not in a completed state.
const loadDecisionContext = async (executor, journeyDecisionUniqueId) => {
  const [rows] = await executor.query(
    `SELECT
       jd.journeyDecisionUniqueId,
       jd.shipperRequestId,
       jd.driverRequestId,
       jd.journeyStatusId,
       jd.decisionBy,
       jd.shippingDateByDriver,
       jd.deliveryDateByDriver,
       jd.shippingCostByDriver,
       jd.journeyDecisionCreatedBy,
       jd.journeyDecisionCreatedAt,
       sr.shippingCost,
       sr.originLatitude,
       sr.originLongitude,
       sr.destinationLatitude,
       sr.destinationLongitude,
       dr.userUniqueId AS driverUserUniqueId
     FROM JourneyDecisions jd
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     WHERE jd.journeyDecisionUniqueId = ?`,
    [journeyDecisionUniqueId],
  );
  const decision = rows[0];
  if (!decision || !completedStatuses.includes(Number(decision.journeyStatusId))) {
    return null;
  }

  // Earliest route point approximates the journey start (driver left the
  // loading place), latest approximates completion (arrival).
  const [points] = await executor.query(
    `SELECT
       latitude, longitude, timestamp AS pointTime
     FROM JourneyRoutePoints
     WHERE journeyDecisionUniqueId = ?
       AND journeyRoutePointsDeletedAt IS NULL
     ORDER BY timestamp ASC`,
    [journeyDecisionUniqueId],
  );

  return { decision, points };
};

// Map a decision context onto the input shape of the existing createJourney
// service. GPS: prefer an actual recorded route point, else shipper coordinates.
const buildJourneyInput = ({ decision, points }) => {
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  return {
    journeyDecisionUniqueId: decision.journeyDecisionUniqueId,
    fare: decision.shippingCostByDriver ?? decision.shippingCost ?? 0,
    journeyStatusId: Number(decision.journeyStatusId),
    journeyStartingLat: firstPoint?.latitude ?? decision.originLatitude ?? null,
    journeyStartingLng: firstPoint?.longitude ?? decision.originLongitude ?? null,
    journeyStartedAt: firstPoint?.pointTime ?? decision.shippingDateByDriver ?? null,
    journeyCompletingLat: lastPoint?.latitude ?? decision.destinationLatitude ?? null,
    journeyCompletingLng: lastPoint?.longitude ?? decision.destinationLongitude ?? null,
    journeyCompletedAt: lastPoint?.pointTime ?? decision.deliveryDateByDriver ?? null,
    journeyCreatedBy:
      decision.decisionBy === "driver"
        ? decision.driverUserUniqueId
        : decision.journeyDecisionCreatedBy,
  };
};

// Rebuild a missing Journey row for one completed decision by delegating to the
// existing createJourney service (idempotent: it skips when the row exists).
// Returns { repaired, journey } where journey is the created/existing row.
const repairMissingJourneyByDecision = async (
  journeyDecisionUniqueId,
  executor = null,
) => {
  const conn = executor || pool;
  const context = await loadDecisionContext(conn, journeyDecisionUniqueId);
  if (!context) {
    return { repaired: false, reason: "NOT_COMPLETED_OR_UNKNOWN" };
  }

  const result = await createJourney(buildJourneyInput(context), conn);
  const row = result?.data?.[0];
  if (!row) {
    return { repaired: false, reason: "CREATE_FAILED" };
  }

  return {
    repaired: String(result?.message || "").includes("created"),
    journey: row,
  };
};

// Batch-load decision contexts so a bulk repair runs a handful of queries
// instead of one round-trip per decision.
const loadBulkContexts = async (executor, decisionIds) => {
  if (!decisionIds?.length) {
    return new Map();
  }
  const placeholders = decisionIds.map(() => "?").join(", ");
  const contextByDecision = new Map();

  const [decisionRows] = await executor.query(
    `SELECT
       jd.journeyDecisionUniqueId,
       jd.shipperRequestId,
       jd.driverRequestId,
       jd.journeyStatusId,
       jd.decisionBy,
       jd.shippingDateByDriver,
       jd.deliveryDateByDriver,
       jd.shippingCostByDriver,
       jd.journeyDecisionCreatedBy,
       jd.journeyDecisionCreatedAt,
       sr.shippingCost,
       sr.originLatitude,
       sr.originLongitude,
       sr.destinationLatitude,
       sr.destinationLongitude,
       dr.userUniqueId AS driverUserUniqueId
     FROM JourneyDecisions jd
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     WHERE jd.journeyDecisionUniqueId IN (${placeholders})`,
    decisionIds,
  );
  for (const row of decisionRows) {
    contextByDecision.set(row.journeyDecisionUniqueId, { decision: row, points: [] });
  }

  const [pointRows] = await executor.query(
    `SELECT
       journeyDecisionUniqueId, latitude, longitude, timestamp AS pointTime
     FROM JourneyRoutePoints
     WHERE journeyDecisionUniqueId IN (${placeholders})
       AND journeyRoutePointsDeletedAt IS NULL
     ORDER BY timestamp ASC`,
    decisionIds,
  );
  for (const p of pointRows) {
    const entry = contextByDecision.get(p.journeyDecisionUniqueId);
    if (entry) {
      entry.points.push(p);
    }
  }

  return contextByDecision;
};

// Repair every completed decision that has no Journey row. Returns counts for
// reporting; idempotent so it can be re-run safely.
const repairAllMissingCompletedJourneys = async () => {
  const conn = await pool.getConnection();
  try {
    const [missing] = await conn.query(
      `SELECT jd.journeyDecisionUniqueId
       FROM JourneyDecisions jd
       LEFT JOIN Journey j ON j.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
       WHERE j.journeyUniqueId IS NULL
         AND jd.journeyStatusId IN (${completedStatusPlaceholders})`,
      completedStatuses,
    );
    const missingIds = missing.map((m) => m.journeyDecisionUniqueId);

    const contextByDecision = await loadBulkContexts(conn, missingIds);

    let repaired = 0;
    const skipped = [];
    for (const row of missing) {
      const context = contextByDecision.get(row.journeyDecisionUniqueId);
      if (!context) {
        skipped.push({
          journeyDecisionUniqueId: row.journeyDecisionUniqueId,
          reason: "NOT_COMPLETED_OR_UNKNOWN",
        });
        continue;
      }

      try {
        const result = await createJourney(buildJourneyInput(context), conn);
        if (result?.data?.[0]) {
          repaired += 1;
        }
      } catch (error) {
        skipped.push({
          journeyDecisionUniqueId: row.journeyDecisionUniqueId,
          reason: `CREATE_FAILED: ${error.message}`,
        });
      }
    }

    return { missing: missing.length, repaired, skipped };
  } finally {
    conn.release();
  }
};

module.exports = {
  repairMissingJourneyByDecision,
  repairAllMissingCompletedJourneys,
  completedStatuses,
};