"use strict";

/**
 * Regression coverage for the cancelled-status revert.
 *
 * `getDetailedJourneyData` used to persist its "stale status" correction while
 * building a READ response. A cancelled request has no supporting
 * (positive) JourneyDecision, so every GET of
 * /api/user/getShipperRequest4allOrSingleUser rewrote it back to `waiting` (1)
 * — including admin-cancelled orders, which then re-entered the offerable
 * queue board. The read path must only PROJECT a correction; persistence
 * belongs to the scheduled reconciler.
 */

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const {
  journeyStatusMap,
  isActiveJourneyStatus,
} = require("../Utils/ListOfSeedData");
const {
  getDetailedJourneyData,
} = require("../Services/ShipperRequest/read/detailed.service");
const {
  reconcileShipperRequestStatuses,
} = require("../Services/ShipperRequest/reconcileStatus.service");

// ── Fixture helpers ──────────────────────────────────────────────────────────

const fixtureIds = [];
const fixtureDriverIds = [];
const fixtureDecisionIds = [];

/**
 * Clones a table row by copying every non-generated, non-auto-increment column.
 * Keeps all foreign keys valid without hardcoding a schema.
 */
const cloneRow = async ({ table, sourceId, pkColumn, overrideUniqueColumn }) => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND EXTRA NOT LIKE '%auto_increment%'
       AND GENERATION_EXPRESSION = ''`,
    [table],
  );
  const names = columns.map(c => c.COLUMN_NAME);
  const uniqueId = uuidv4();
  const selectList = names
    .map(n => (n === overrideUniqueColumn ? "?" : `t.\`${n}\``))
    .join(", ");
  const columnList = names.map(n => `\`${n}\``).join(", ");
  const [result] = await pool.query(
    `INSERT INTO \`${table}\` (${columnList})
     SELECT ${selectList} FROM \`${table}\` t WHERE t.\`${pkColumn}\` = ?`,
    [uniqueId, sourceId],
  );
  return result.insertId;
};

/**
 * Clones an existing ShipperRequest row (so every foreign key stays valid) and
 * forces the given status on the copy. The clone is a brand new
 * shipperRequestId, so it has no JourneyDecisions of its own — exactly the
 * shape of a freshly cancelled order.
 */
const cloneRequestWithStatus = async (statusId, sourceShipperRequestId = null) => {
    let sourceId = sourceShipperRequestId;
    if (!sourceId) {
      const [rows] = await pool.query(
        "SELECT shipperRequestId FROM ShipperRequest ORDER BY shipperRequestId LIMIT 1",
      );
      sourceId = rows[0].shipperRequestId;
    }

const newId = await cloneRow({
      table: "ShipperRequest",
      sourceId,
      pkColumn: "shipperRequestId",
      overrideUniqueColumn: "shipperRequestUniqueId",
    });

    await pool.query(
      "UPDATE ShipperRequest SET journeyStatusId = ? WHERE shipperRequestId = ?",
      [statusId, newId],
    );

    fixtureIds.push(newId);
    return newId;
  };

/**
 * Clones a DriverRequest. The clone is forced to a non-active status so
 * `activeRequestGuard` (STORED GENERATED: 1 when status is 1..5) stays NULL —
 * `uq_driver_active_request` is (userUniqueId, activeRequestGuard) and permits
 * only one active row per user, while NULLs never collide.
 */
const cloneDriverRequest = async (sourceDriverRequestId = null) => {
  let sourceId = sourceDriverRequestId;
  if (!sourceId) {
    const [rows] = await pool.query(
      "SELECT driverRequestId FROM DriverRequest ORDER BY driverRequestId LIMIT 1",
    );
    sourceId = rows[0].driverRequestId;
  }
  const newId = await cloneRow({
    table: "DriverRequest",
    sourceId,
    pkColumn: "driverRequestId",
    overrideUniqueColumn: "driverRequestUniqueId",
  });
  await pool.query(
    "UPDATE DriverRequest SET journeyStatusId = ? WHERE driverRequestId = ?",
    [journeyStatusMap.journeyCompleted, newId],
  );
  fixtureDriverIds.push(newId);
  return newId;
};

/**
 * A live request that HAS a supporting decision — the shape that must render
 * with its driver and decision attached, never be treated as stale.
 */
const cloneRequestWithDecision = async (statusId, decisionStatusId) => {
  const shipperRequestId = await cloneRequestWithStatus(statusId);
  const driverRequestId = await cloneDriverRequest();
  const [src] = await pool.query(
    "SELECT userUniqueId FROM ShipperRequest WHERE shipperRequestId = ?",
    [shipperRequestId],
  );
  const [result] = await pool.query(
    `INSERT INTO JourneyDecisions
       (journeyDecisionUniqueId, shipperRequestId, driverRequestId, journeyStatusId,
        decisionTime, decisionBy, journeyDecisionCreatedBy, journeyDecisionCreatedAt)
     VALUES (?, ?, ?, ?, NOW(), 'driver', ?, NOW())`,
    [uuidv4(), shipperRequestId, driverRequestId, decisionStatusId, src[0].userUniqueId],
  );
  fixtureDecisionIds.push(result.insertId);
  return { shipperRequestId, driverRequestId };
};

const readStatus = async (shipperRequestId) => {
  const [rows] = await pool.query(
    "SELECT journeyStatusId FROM ShipperRequest WHERE shipperRequestId = ?",
    [shipperRequestId],
  );
  return rows[0]?.journeyStatusId;
};

const readRow = async (shipperRequestId) => {
  const [rows] = await pool.query(
    "SELECT * FROM ShipperRequest WHERE shipperRequestId = ?",
    [shipperRequestId],
  );
  return rows[0];
};

const dropFixtures = async () => {
    // Children first: JourneyDecisions -> DriverRequest/ShipperRequest are FKs.
    if (fixtureDecisionIds.length > 0) {
      await pool.query("DELETE FROM JourneyDecisions WHERE journeyDecisionId IN (?)", [
        fixtureDecisionIds,
      ]);
      fixtureDecisionIds.length = 0;
    }
    if (fixtureDriverIds.length > 0) {
      await pool.query("DELETE FROM DriverRequest WHERE driverRequestId IN (?)", [
        fixtureDriverIds,
      ]);
      fixtureDriverIds.length = 0;
    }
    if (fixtureIds.length > 0) {
      await pool.query("DELETE FROM ShipperRequest WHERE shipperRequestId IN (?)", [
        fixtureIds,
      ]);
      fixtureIds.length = 0;
    }
  };

// Open a connection before the first test so the suite's initial query is not
// also the cold-pool handshake (that made the first test intermittently slow).
beforeAll(async () => {
  await pool.query("SELECT 1");
});

// Each test builds its own fixtures; clearing between tests keeps one test's
// rows out of another's reconciler counts.
beforeEach(dropFixtures);
afterAll(dropFixtures);

// ── The status guard ─────────────────────────────────────────────────────────

describe("isActiveJourneyStatus guard", () => {
  test("live statuses are reconcilable", () => {
    expect(isActiveJourneyStatus(journeyStatusMap.waiting)).toBe(true);
    expect(isActiveJourneyStatus(journeyStatusMap.requested)).toBe(true);
    expect(isActiveJourneyStatus(journeyStatusMap.journeyStarted)).toBe(true);
  });

  test("terminal statuses are off-limits to reconciliation", () => {
    expect(isActiveJourneyStatus(journeyStatusMap.cancelledByAdmin)).toBe(false);
    expect(isActiveJourneyStatus(journeyStatusMap.cancelledBySystem)).toBe(false);
    expect(isActiveJourneyStatus(journeyStatusMap.cancelledByShipper)).toBe(false);
    expect(isActiveJourneyStatus(journeyStatusMap.completedByAdmin)).toBe(false);
    expect(isActiveJourneyStatus(journeyStatusMap.journeyCompleted)).toBe(false);
  });
});

// ── The regression: reading must not rewrite a cancelled order ───────────────

describe("getDetailedJourneyData must not revert a cancelled order", () => {
  test.each([
    ["cancelledByAdmin", journeyStatusMap.cancelledByAdmin],
    ["cancelledBySystem", journeyStatusMap.cancelledBySystem],
    ["cancelledByShipper", journeyStatusMap.cancelledByShipper],
  ])("%s survives the read and is not rewritten", async (_name, statusId) => {
    const id = await cloneRequestWithStatus(statusId);
    const row = await readRow(id);

    const results = await getDetailedJourneyData([row]);

    expect(results).toHaveLength(1);
    expect(results[0].shipperRequest.journeyStatusId).toBe(statusId);
    // The whole point: the persisted status is untouched by a GET.
    expect(await readStatus(id)).toBe(statusId);
  });

  test("an admin-cancelled order is returned, not dropped from the list", async () => {
    const id = await cloneRequestWithStatus(journeyStatusMap.cancelledByAdmin);
    const row = await readRow(id);

    const results = await getDetailedJourneyData([row]);

    expect(results.map(r => r.shipperRequest.shipperRequestId)).toContain(id);
  });
});

// ── The regression: a live order that HAS a decision must keep it ────────────
//
// A misspelled lookup key (`sr.shipneyRequestId`) makes every live order look
// like it has no supporting decision, so it is projected to `waiting` and
// stripped of its driver. These tests fail on that typo and pass only when the
// decision is actually found by `shipperRequestId`.

describe("getDetailedJourneyData must keep a live order's decision", () => {
  test("acceptedByDriver renders with its driver and decision attached", async () => {
    const { shipperRequestId } = await cloneRequestWithDecision(
      journeyStatusMap.acceptedByDriver,
      journeyStatusMap.acceptedByDriver,
    );
    const row = await readRow(shipperRequestId);

    const results = await getDetailedJourneyData([row]);

    expect(results).toHaveLength(1);
    const [result] = results;
    expect(result.shipperRequest.journeyStatusId).toBe(
      journeyStatusMap.acceptedByDriver,
    );
    expect(result.decisions).toHaveLength(1);
    expect(result.driverRequests).toHaveLength(1);
    expect(result.decisions[0].driverRequestId).toBe(
      result.driverRequests[0].driverRequestId,
    );
    // A GET must not touch the stored status either.
    expect(await readStatus(shipperRequestId)).toBe(
      journeyStatusMap.acceptedByDriver,
    );
  });

  test("a live order whose decision is ahead is projected forward, not back to waiting", async () => {
    const { shipperRequestId } = await cloneRequestWithDecision(
      journeyStatusMap.requested,
      journeyStatusMap.acceptedByDriver,
    );
    const row = await readRow(shipperRequestId);

    const results = await getDetailedJourneyData([row]);

    expect(results).toHaveLength(1);
    expect(results[0].shipperRequest.journeyStatusId).toBe(
      journeyStatusMap.acceptedByDriver,
    );
    expect(results[0].decisions).toHaveLength(1);
    // Projection only — the stored status is left alone.
    expect(await readStatus(shipperRequestId)).toBe(journeyStatusMap.requested);
  });
});

// ── The reconciler keeps its job, minus the terminal statuses ────────────────

describe("reconcileShipperRequestStatuses", () => {
  test("never resets a terminal status", async () => {
    const id = await cloneRequestWithStatus(journeyStatusMap.cancelledByAdmin);

    const summary = await reconcileShipperRequestStatuses();

    expect(summary.reset).toBe(0);
    expect(summary.advanced).toBe(0);
    expect(await readStatus(id)).toBe(journeyStatusMap.cancelledByAdmin);
  });

  test("resets a live request whose supporting decisions are gone", async () => {
    const id = await cloneRequestWithStatus(journeyStatusMap.acceptedByDriver);

    await reconcileShipperRequestStatuses();

    expect(await readStatus(id)).toBe(journeyStatusMap.waiting);
  });

  test("dryRun reports the reset without touching the row", async () => {
    const id = await cloneRequestWithStatus(journeyStatusMap.acceptedByDriver);

    const summary = await reconcileShipperRequestStatuses({ dryRun: true });

    expect(summary.dryRun).toBe(true);
    expect(summary.reset).toBeGreaterThanOrEqual(1);
    expect(summary.details.some(d => d.shipperRequestId === id)).toBe(true);
    expect(await readStatus(id)).toBe(journeyStatusMap.acceptedByDriver);
  });
});