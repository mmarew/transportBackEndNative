"use strict";

// Driver check-in / position / check-out — TQ-05..TQ-10 from the queue test plan.

const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const {
  createQueueOrganization,
  approveQueueOrganization,
  checkin,
  checkout,
  myPosition,
  getQueueStatus,
  dbToday,
  getActiveQueueCountForDriver,
  expectStatus,
} = require("./helpers");

const getActiveEntry = async (driverKey, queueOrganizationUniqueId, queueDate = dbToday()) => {
  const [rows] = await pool.query(
    `SELECT dq.*
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND u.phoneNumber = ? AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber DESC LIMIT 1`,
    [queueOrganizationUniqueId, queueDate, require("../constants").usersData[driverKey].phoneNumber],
  );
  return rows[0] || null;
};

// ── TQ-05 · Check-in stamps queue number per vehicle type ─────────────────────

const testTQ05CheckinNumbers = async () => {
  const { queueOrganizationUniqueId } = queueState.org.main;
  const queueDate = dbToday();
  try {
    const d1 = await checkin("queueDriver1", queueOrganizationUniqueId);
    if (d1.queueNumber !== 1) {
      throw new Error(`driver01 expected queueNumber 1, got ${d1.queueNumber}`);
    }
    const d2 = await checkin("queueDriver2", queueOrganizationUniqueId);
    if (d2.queueNumber !== 2) {
      throw new Error(`driver02 expected queueNumber 2, got ${d2.queueNumber}`);
    }
    const d3 = await checkin("queueDriver3", queueOrganizationUniqueId);
    if (d3.queueNumber !== 3) {
      throw new Error(`driver03 expected queueNumber 3, got ${d3.queueNumber}`);
    }
    const d4 = await checkin("queueDriver4", queueOrganizationUniqueId);
    if (d4.queueNumber !== 1) {
      throw new Error(`driver04 (typeB) expected queueNumber 1, got ${d4.queueNumber}`);
    }
    report.pass("TQ-05: check-in stamps queue numbers (d1=1, d2=2, d3=3, d4=1 typeB)");

    const [rows] = await pool.query(
      `SELECT dq.queueNumber, dq.status, dq.queueRefusalCount, u.phoneNumber, v.vehicleTypeUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ? AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber ASC`,
      [queueOrganizationUniqueId, queueDate],
    );
    const typeA = rows.filter((r) => r.vehicleTypeUniqueId === queueState.vehicleTypes.typeA);
    const typeB = rows.filter((r) => r.vehicleTypeUniqueId === queueState.vehicleTypes.typeB);
    if (
      typeA.length !== 3 ||
      typeB.length !== 1 ||
      rows.some((r) => r.status !== "waiting") ||
      rows.some((r) => r.queueRefusalCount !== 0)
    ) {
      throw new Error(`Unexpected DriverQueue rows: ${JSON.stringify(rows)}`);
    }
    report.pass("TQ-05: DB rows waiting, refusalCount=0, per-type sequences");
  } catch (error) {
    report.fail("TQ-05: check-in queue numbers", error);
  }
};

// ── TQ-07 · Re-check-in is idempotent (same org) ──────────────────────────────

const testTQ07IdempotentRecheckin = async () => {
  const { queueOrganizationUniqueId } = queueState.org.main;
  try {
    const before = await getActiveEntry("queueDriver1", queueOrganizationUniqueId);
    const again = await checkin("queueDriver1", queueOrganizationUniqueId);
    if (again.queueUniqueId !== before.queueUniqueId) {
      throw new Error("Re-check-in returned a different queueUniqueId");
    }
    if (again.queueNumber !== before.queueNumber) {
      throw new Error(`Re-check-in repositioned driver01: ${before.queueNumber} → ${again.queueNumber}`);
    }
    const activeCount = await getActiveQueueCountForDriver("queueDriver1");
    if (activeCount !== 1) {
      throw new Error(`Expected 1 active row for driver01, got ${activeCount}`);
    }
    report.pass("TQ-07: re-check-in idempotent (same entry, same number)");
  } catch (error) {
    report.fail("TQ-07: idempotent re-check-in", error);
  }
};

// ── TQ-06 · Single-queue-per-day fence → 409 ──────────────────────────────────

const testTQ06Fence = async () => {
  try {
    const name = `Fence Org ${Date.now()}`;
    const org = await createQueueOrganization(name);
    queueState.org.fence.queueOrganizationUniqueId = org.queueOrganizationUniqueId;
    await approveQueueOrganization({
      queueOrganizationUniqueId: org.queueOrganizationUniqueId,
      approvalStatus: "approved",
      queueEnabled: true,
    });

    await expectStatus(
      checkin("queueDriver1", org.queueOrganizationUniqueId),
      409,
      "TQ-06 fence second org",
    );
    report.pass("TQ-06: second-org check-in blocked (409) — one queue per day");

    const activeCount = await getActiveQueueCountForDriver("queueDriver1");
    if (activeCount !== 1) {
      throw new Error(`Fence violated: driver01 has ${activeCount} active rows`);
    }
    report.pass("TQ-06: no duplicate active row after blocked check-in");
  } catch (error) {
    report.fail("TQ-06: single-queue-per-day fence", error);
  }
};

// ── TQ-09 · myPosition ────────────────────────────────────────────────────────

const testTQ09MyPosition = async () => {
  const { queueOrganizationUniqueId } = queueState.org.main;
  try {
    const pos = await myPosition("queueDriver2", queueOrganizationUniqueId);
    if (Array.isArray(pos) || pos.queueNumber !== 2) {
      throw new Error(`driver02 myPosition expected queueNumber 2, got ${JSON.stringify(pos)}`);
    }
    if (pos.waitingAhead !== 1) {
      throw new Error(`driver02 waitingAhead expected 1, got ${pos.waitingAhead}`);
    }
    report.pass("TQ-09: myPosition returns queueNumber=2, waitingAhead=1");

    const d4Pos = await myPosition("queueDriver4", queueOrganizationUniqueId);
    if (Array.isArray(d4Pos) || d4Pos.waitingAhead !== 0) {
      throw new Error(`driver04 (typeB) waitingAhead expected 0, got ${JSON.stringify(d4Pos)}`);
    }
    report.pass("TQ-09: myPosition per-type (typeB driver sees 0 ahead)");
  } catch (error) {
    report.fail("TQ-09: myPosition", error);
  }
};

// ── TQ-10 · Check-out ─────────────────────────────────────────────────────────

const testTQ10Checkout = async () => {
  const { queueOrganizationUniqueId } = queueState.org.main;
  try {
    await checkout("queueDriver1", queueOrganizationUniqueId);

    const entry = await getActiveEntry("queueDriver1", queueOrganizationUniqueId);
    if (!entry || entry.status !== "removed") {
      throw new Error(`driver01 entry expected 'removed', got ${entry?.status}`);
    }
    report.pass("TQ-10: checkout marks entry removed");

    const pos = await myPosition("queueDriver1", queueOrganizationUniqueId);
    if (!Array.isArray(pos)) {
      throw new Error("driver01 myPosition should be empty after checkout");
    }
    report.pass("TQ-10: myPosition empty after checkout");

    const status = await getQueueStatus(queueOrganizationUniqueId);
    if (status.totalWaiting !== 3) {
      throw new Error(`Expected totalWaiting 3, got ${status.totalWaiting}`);
    }
    report.pass("TQ-10: remaining drivers keep positions (gaps allowed)");
  } catch (error) {
    report.fail("TQ-10: check-out", error);
  }
};

// ── Entry point ───────────────────────────────────────────────────────────────

const runQueueCheckinTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  CHECK-IN / POSITION / CHECK-OUT — TQ-05..TQ-10");
  console.log("═══════════════════════════════════════════════════\n");

  await testTQ05CheckinNumbers();
  await testTQ07IdempotentRecheckin();
  await testTQ06Fence();
  await testTQ09MyPosition();
  await testTQ10Checkout();
};

module.exports = { runQueueCheckinTests };
