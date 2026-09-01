"use strict";

// Queue admin manual operations + non-queue regression — TQ-33..TQ-37, TQ-39.

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
  checkin,
  cancelOrder,
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
    queueState.adminOps.oMUniqueId = orderUniqueId;
    queueState.adminOps.oMDriverKey = "queueDriver1";
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

    // Queue admin checks d1 back in — the check-in auto-dispatch immediately
    // hands the still-waiting O_M to the front driver.
    const entry = await manualCheckin(ORG(), "queueDriver1", qadminToken());
    if (!entry?.queueUniqueId) {
      throw new Error("re-check-in before dispatch failed");
    }
    const row = await entryOf("queueDriver1");
    if (!row || row.status !== "requested" || row.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`d1 not requested O_M after check-in dispatch: ${JSON.stringify(row)}`);
    }
    const accepted = await acceptOrder("queueDriver1", 6000);
    if (!accepted) {
      throw new Error("O_M accept failed");
    }
    const after = await entryOf("queueDriver1");
    if (!after || after.status !== "agreed") {
      throw new Error(`d1 should be agreed after accept: ${JSON.stringify(after)}`);
    }
    report.pass("TQ-36: manual dispatch empty→404, then check-in dispatch → offer → accept");
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

// ── TQ-37 · Targeted dispatch (queueUniqueId / driverPhoneNumber) ─────────────
//
// POST /api/queue/dispatch normally offers to the FRONT waiting driver of the
// order's vehicle type (FIFO — covered by TQ-36). QueueOrgAdmins can instead
// name a SPECIFIC driver via `queueUniqueId` (their DriverQueue entry) or
// `driverPhoneNumber` (their active vehicle assignment). The targeted entry
// must still be `waiting`/`notagreed` today, match the order's vehicle type,
// not have already refused the order, and not be pinned to another shipper.

const testTQ37TargetedDispatch = async () => {
  try {
    // TQ-36 left d1 `agreed` on O_M, so a fresh order has no eligible driver
    // and must stay `waiting`.
    const d1Entry = await entryOf("queueDriver1");
    if (!d1Entry?.queueUniqueId || d1Entry.status !== "agreed") {
      throw new Error(`expected d1 agreed on O_M: ${JSON.stringify(d1Entry)}`);
    }

    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: queueState.vehicleTypes.typeB,
    });
    const guardOrderUniqueId = (await getLatestOrders(1))[0]?.shipperRequestUniqueId;
    if ((await getOrderByUniqueId(guardOrderUniqueId)).journeyStatusId !== 1) {
      throw new Error("guard order should wait while d1 holds O_M");
    }

    // ── Guards: the targeted modes must validate before mutating anything ──
    await expectStatus(
      manualDispatch({
        queueOrganizationUniqueId: ORG(),
        queueUniqueId: d1Entry.queueUniqueId,
        driverPhoneNumber: "+251111111111",
        shipperRequestUniqueId: guardOrderUniqueId,
        token: qadminToken(),
      }),
      400,
      "TQ-37 conflicting selectors (queueUniqueId + driverPhoneNumber)",
    );
    await expectStatus(
      manualDispatch({
        queueOrganizationUniqueId: ORG(),
        queueUniqueId: "19f4a9ce-83ea-4af4-a12e-3d4b1f5c5a2c",
        shipperRequestUniqueId: guardOrderUniqueId,
        token: qadminToken(),
      }),
      404,
      "TQ-37 unknown queueUniqueId",
    );
    await expectStatus(
      manualDispatch({
        queueOrganizationUniqueId: ORG(),
        driverPhoneNumber: "+251999999999",
        shipperRequestUniqueId: guardOrderUniqueId,
        token: qadminToken(),
      }),
      404,
      "TQ-37 unknown driverPhoneNumber",
    );
    await expectStatus(
      manualDispatch({
        queueOrganizationUniqueId: ORG(),
        queueUniqueId: d1Entry.queueUniqueId,
        shipperRequestUniqueId: guardOrderUniqueId,
        token: qadminToken(),
      }),
      404,
      "TQ-37 busy (agreed) entry not dispatchable",
    );

    // ── Reset d1 to a real `waiting` state through the product flows, so the
    // positives are driven by the same code paths as production:
    //   1. admin-cancel O_M → journey ends, driver request terminalized
    //   2. driver re-checks-in → the engine revives the agreed entry to
    //      `waiting` and (re)creates a clean waiting DriverRequest. With no
    //      pending order left the check-in auto-dispatch has nothing to steal.
    // ──
    await cancelOrder({ orderUniqueId: queueState.adminOps.oMUniqueId, cancelAs: "admin" });
    await checkin("queueDriver1", ORG());
    const waitingEntry = await entryOf("queueDriver1");
    if (!waitingEntry || waitingEntry.status !== "waiting") {
      throw new Error(
        `d1 should be waiting after revive reset: ${JSON.stringify(waitingEntry)}`,
      );
    }

    // ── POSITIVE #1: targeted dispatch by driverPhoneNumber ──
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
    });
    const oT1UniqueId = (await getLatestOrders(1))[0]?.shipperRequestUniqueId;
    const viaPhone = await manualDispatch({
      queueOrganizationUniqueId: ORG(),
      driverPhoneNumber: usersData.queueDriver1?.phoneNumber,
      shipperRequestUniqueId: oT1UniqueId,
      token: qadminToken(),
    });
    if (viaPhone?.offered !== true) {
      throw new Error(
        `targeted (driverPhoneNumber) dispatch failed: ${JSON.stringify(viaPhone)}`,
      );
    }
    const afterPhoneDispatch = await entryOf("queueDriver1");
    if (
      !afterPhoneDispatch ||
      afterPhoneDispatch.status !== "requested" ||
      afterPhoneDispatch.shipperRequestUniqueId !== oT1UniqueId
    ) {
      throw new Error(
        `d1 should be requested O_T1 after phone dispatch: ${JSON.stringify(afterPhoneDispatch)}`,
      );
    }

    // ── POSITIVE #2: targeted dispatch by queueUniqueId ──
    // Cancel O_T1 as admin → driver request terminalized + queue entry released
    // back to `waiting` (releaseEntryOnOrderCancel keeps position, no refusal
    // counted). A second order O_T2 created on top waits for the named entry.
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
    });
    const oT2UniqueId = (await getLatestOrders(1))[0]?.shipperRequestUniqueId;
    await cancelOrder({ orderUniqueId: oT1UniqueId, cancelAs: "admin" });
    const releasedEntry = await entryOf("queueDriver1");
    if (!releasedEntry || releasedEntry.status !== "waiting") {
      throw new Error(
        `d1 should be waiting after O_T1 cancel: ${JSON.stringify(releasedEntry)}`,
      );
    }
    const viaEntry = await manualDispatch({
      queueOrganizationUniqueId: ORG(),
      queueUniqueId: releasedEntry.queueUniqueId,
      shipperRequestUniqueId: oT2UniqueId,
      token: qadminToken(),
    });
    if (viaEntry?.offered !== true) {
      throw new Error(
        `targeted (queueUniqueId) dispatch failed: ${JSON.stringify(viaEntry)}`,
      );
    }
    const afterEntryDispatch = await entryOf("queueDriver1");
    if (
      !afterEntryDispatch ||
      afterEntryDispatch.status !== "requested" ||
      afterEntryDispatch.shipperRequestUniqueId !== oT2UniqueId
    ) {
      throw new Error(
        `d1 should be requested O_T2 after targeted dispatch: ${JSON.stringify(afterEntryDispatch)}`,
      );
    }

    // ── Leave d1 free (waiting, no active journey) for the History suite ──
    await cancelOrder({ orderUniqueId: oT2UniqueId, cancelAs: "admin" });
    const finalRow = await entryOf("queueDriver1");
    if (!finalRow || finalRow.status !== "waiting") {
      throw new Error(
        `d1 should be waiting at TQ-37 end: ${JSON.stringify(finalRow)}`,
      );
    }

    report.pass(
      "TQ-37: targeted dispatch by queueUniqueId + driverPhoneNumber (guards + positives)",
    );
  } catch (error) {
    report.fail("TQ-37: targeted dispatch", error);
  }
};

// ── Entry point ───────────────────────────────────────────────────────────────

const runQueueAdminTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  QUEUE ADMIN OPS — TQ-33..TQ-37, TQ-39");
  console.log("═══════════════════════════════════════════════════\n");

  await testTQ33ManualCheckin();
  await testTQ34OverridePosition();
  await testTQ35RemoveEntry();
  await testTQ36ManualDispatch();
  await testTQ37TargetedDispatch();
  await testTQ39NonQueueRegression();
};

module.exports = { runQueueAdminTests };
