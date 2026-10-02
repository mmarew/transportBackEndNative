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

    const [columns] = await pool.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'ShipperRequest'
         AND EXTRA NOT LIKE '%auto_increment%'
         AND GENERATION_EXPRESSION = ''`,
    );
    const names = columns.map(c => c.COLUMN_NAME);
    const uniqueId = uuidv4();
    // shipperRequestUniqueId is NOT NULL UNIQUE, so the clone needs its own.
    const selectList = names
      .map(n => (n === "shipperRequestUniqueId" ? "?" : `t.\`${n}\``))
      .join(", ");
    const columnList = names.map(n => `\`${n}\``).join(", ");

    const [result] = await pool.query(
      `INSERT INTO ShipperRequest (${columnList})
       SELECT ${selectList} FROM ShipperRequest t WHERE t.shipperRequestId = ?`,
      [uniqueId, sourceId],
    );

    const newId = result.insertId;
    await pool.query(
      "UPDATE ShipperRequest SET journeyStatusId = ? WHERE shipperRequestId = ?",
      [statusId, newId],
    );

    fixtureIds.push(newId);
    return newId;
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
  if (fixtureIds.length === 0) return;
  await pool.query("DELETE FROM ShipperRequest WHERE shipperRequestId IN (?)", [
    fixtureIds,
  ]);
  fixtureIds.length = 0;
};

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