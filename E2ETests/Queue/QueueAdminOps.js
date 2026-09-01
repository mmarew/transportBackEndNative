"use strict";

// Queue admin manual operations + non-queue regression — TQ-33..TQ-36, TQ-39.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const {
  createQueueOrder,
  buildQueueOrderPayload,
  manualCheckin,
  overrideEntry,
  removeEntry,
  manualDispatch,
  acceptOrder,
  getLatestOrders,
  getOrderByUniqueId,
  getQueueEntryByDriver,
  getJourneyDecisionCount,
  shipperToken,
  dbToday,
  expectStatus,
} = require("./helpers");

const ORG = () => queueState.org.main.queueOrganizationUniqueId;
const qadminToken = () => usersData.queueOrgAdmin?.token;

const entryOf = (driverKey) =>
  getQueueEntryByDriver({ queueOrganizationUniqueId: ORG(), driverKey });

// ── TQ-33 · Manual check-in by queue admin ────────────────────────────────────

const testTQ33ManualCheckin = async () => {
  try {
    const entry = await manualCheckin(ORG(), "queueDriver1", qadminToken());
    if (!entry?.queueUniqueId) {
      throw new Error(`manual check-in failed: ${JSON.stringify(entry)}`);
    }
    const row = await entryOf("queueDriver1");
    if (!row || row.status !== "waiting" || row.queueRefusalCount !== 0) {
      throw new Error(`manual check-in entry wrong: ${JSON.stringify(row)}`);
    }
    queueState.adminOps.d1QueueUniqueId = row.queueUniqueId;
    queueState.adminOps.d1QueueNumberBefore = row.queueNumber;
    report.pass(
      `TQ-33: manual check-in by queue admin → waiting entry (queueNumber ${row.queueNumber})`,
    );
  } catch (error) {
    report.fail("TQ-33: manual check-in", error);
  }
};

// ── TQ-34 · Override entry position (audited) ─────────────────────────────────

const testTQ34OverridePosition = async () => {
  try {
    const queueUniqueId = queueState.adminOps.d1QueueUniqueId;
    await overrideEntry(queueUniqueId, 1, qadminToken());

    const row = await entryOf("queueDriver1");
    if (!row || row.queueNumber !== 1) {
      throw new Error(`override failed: ${JSON.stringify(row)}`);
    }

    const qadminUserUniqueId = await (async () => {
      const [rows] = await pool.query(
        `SELECT userUniqueId FROM Users WHERE phoneNumber = ?`,
        [usersData.queueOrgAdmin.phoneNumber],
      );
      return rows[0]?.userUniqueId;
    })();

    const [auditRows] = await pool.query(
      `SELECT * FROM QueueAuditLog
       WHERE queueUniqueId = ? AND action = 'override'
       ORDER BY performedAt DESC LIMIT 1`,
      [queueUniqueId],
    );
    if (auditRows.length === 0) {
      throw new Error("no override audit row");
    }
    if (qadminUserUniqueId && auditRows[0].performedBy !== qadminUserUniqueId) {
      throw new Error(
        `audit actor mismatch: ${auditRows[0].performedBy} vs qadmin ${qadminUserUniqueId}`,
      );
    }
    report.pass("TQ-34: override entry to #1, position updated + audit recorded");
  } catch (error) {
    report.fail("TQ-34: override entry position", error);
  }
};

// ── TQ-35 · Remove entry (no-show) ────────────────────────────────────────────

const testTQ35RemoveEntry = async () => {
  try {
    const queueUniqueId = queueState.adminOps.d1QueueUniqueId;
    await removeEntry(queueUniqueId, qadminToken());

    const row = await entryOf("queueDriver1");
    if (!row || row.status !== "removed") {
      throw new Error(`entry should be removed: ${JSON.stringify(row)}`);
    }
    const [auditRows] = await pool.query(
      `SELECT * FROM QueueAuditLog
       WHERE queueUniqueId = ? AND action = 'remove'
       ORDER BY performedAt DESC LIMIT 1`,
      [queueUniqueId],
    );
    if (auditRows.length === 0) {
      throw new Error("no remove audit row");
    }
    report.pass("TQ-35: remove entry (no-show) → removed + audit recorded");
  } catch (error) {
    report.fail("TQ-35: remove entry", error);
  }
};

// ── TQ-36 · Manual dispatch ───────────────────────────────────────────────────

const testTQ36ManualDispatch = async () => {
  try {
    // Order placed while no typeA driver is waiting (d2/d3 agreed, d1 removed).
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
    });
    const orderUniqueId = (await getLatestOrders(1))[0].shipperRequestUniqueId;
    const order = await getOrderByUniqueId(orderUniqueId);
    if (order.journeyStatusId !== 1) {
      throw new Error(`O_M should wait (no waiting driver), got ${order.journeyStatusId}`);
    }
    if ((await getJourneyDecisionCount(orderUniqueId)) !== 0) {
      throw new Error("O_M should have no auto offer");
    }

    // Manual dispatch on an empty queue → 404.
    await expectStatus(
      manualDispatch({
        queueOrganizationUniqueId: ORG(),
        vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
        shipperRequestUniqueId: orderUniqueId,
        token: qadminToken(),
      }),
      404,
      "TQ-36 manual dispatch empty queue",
    );

    // Queue admin checks a driver back in, then manually dispatches → requested.
    const entry = await manualCheckin(ORG(), "queueDriver1", qadminToken());
    if (!entry?.queueUniqueId) {
      throw new Error("re-check-in before manual dispatch failed");
    }
    const dispatch = await manualDispatch({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
      shipperRequestUniqueId: orderUniqueId,
      token: qadminToken(),
    });
    if (!dispatch?.offered) {
      throw new Error(`manual dispatch did not offer: ${JSON.stringify(dispatch)}`);
    }

    const row = await entryOf("queueDriver1");
    if (!row || row.status !== "requested" || row.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`d1 not requested O_M after manual dispatch: ${JSON.stringify(row)}`);
    }
    const accepted = await acceptOrder("queueDriver1", 6000);
    if (!accepted) {
      throw new Error("manual-dispatched order accept failed");
    }
    const after = await entryOf("queueDriver1");
    if (!after || after.status !== "agreed") {
      throw new Error(`d1 should be agreed after accept: ${JSON.stringify(after)}`);
    }
    report.pass("TQ-36: manual dispatch empty→404, then check-in + dispatch → offer → accept");
  } catch (error) {
    report.fail("TQ-36: manual dispatch", error);
  }
};

// ── TQ-39 · Non-queue (distance) matching unaffected ──────────────────────────

const testTQ39NonQueueRegression = async () => {
  try {
    const payload = buildQueueOrderPayload({
      vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
    });
    delete payload.queueOrganizationUniqueId;
    await axios.post(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
      payload,
      authConfig(shipperToken()),
    );
    const orderUniqueId = (await getLatestOrders(1))[0].shipperRequestUniqueId;

    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM DriverQueue WHERE shipperRequestUniqueId = ?`,
      [orderUniqueId],
    );
    if (rows[0].total !== 0) {
      throw new Error("non-queue order must not touch DriverQueue");
    }
    const [decisionRows] = await pool.query(
      `SELECT jd.journeyStatusId, jd.decisionBy
       FROM JourneyDecisions jd
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       WHERE sr.shipperRequestUniqueId = ?`,
      [orderUniqueId],
    );
    for (const d of decisionRows) {
      if (d.decisionBy === "queue") {
        throw new Error("non-queue order must not be offered via queue engine");
      }
    }
    report.pass("TQ-39: non-queue order bypasses queue engine (no DriverQueue rows)");
  } catch (error) {
    report.fail("TQ-39: non-queue regression", error);
  }
};

// ── Entry point ───────────────────────────────────────────────────────────────

const runQueueAdminTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  QUEUE ADMIN OPS — TQ-33..TQ-36, TQ-39");
  console.log("═══════════════════════════════════════════════════\n");

  await testTQ33ManualCheckin();
  await testTQ34OverridePosition();
  await testTQ35RemoveEntry();
  await testTQ36ManualDispatch();
  await testTQ39NonQueueRegression();
};

module.exports = { runQueueAdminTests };
