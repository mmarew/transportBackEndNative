"use strict";

// Batch-refusal rule — TQ-BR1..TQ-BR3:
//   A driver who declines ANY order of a batch (statuses 12/16/18, plus the
//   legacy 11/13 carried by REJECTED_STATUS_IDS) must not be AUTO-offered the
//   batch's OTHER orders (FIFO scan, distance/bid matching, or the check-in bid
//   pull), unless the reconnection is a targeted manual dispatch.
//
// Runs AFTER QueueOrders (main org). At that point d2/d3/d4 are AGREED with
// active journeys and d1 is REMOVED (TQ-32 cleanup) — the AdminOps suite will
// re-check-in d1 fresh. This block uses d1 as the sole FIFO driver: checks him
// in, declines one job of a 2-slot batch, asserts the batch stays cooled,
// reconnects via targeted dispatch, proves per-batch scope with an unrelated
// order, then cancels every created order and removes d1's entry so the
// required TQ-33 pre-state (d1 free, no pending typeA order) is restored
// exactly.

const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { backendURL, usersData, usersRoles, journeyStatusMap, cancellationReasonsType } = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const {
  createQueueOrder,
  manualCheckin,
  manualDispatch,
  removeEntry,
  cancelOrder,
  getLatestOrders,
  getOrderByUniqueId,
  getJourneyDecisionCount,
  getQueueEntryByDriver,
  driverToken,
} = require("./helpers");

const ORG = () => queueState.org.main.queueOrganizationUniqueId;
const typeA = () => queueState.vehicleTypes.typeA;
const qadminToken = () => usersData.queueOrgAdmin?.token;

const entryOf = (driverKey) =>
  getQueueEntryByDriver({ queueOrganizationUniqueId: ORG(), driverKey });

/**
 * Driver rejects their LIVE incoming offer (pre-accept) via
 * PUT /api/driver/cancelRequest (ownerUserUniqueId=self). The cancel engine
 * targets the driver's current active requested offer (priority-ordered), so
 * no client-side offer ids are needed.
 *
 * @param {string} driverKey - Driver key (e.g. "queueDriver1").
 * @returns {Promise<Object>} Cancel/cancel-request API response data.
 */
const rejectOrderByDriver = async (driverKey) => {
  const res = await axios.put(
    backendURL +
      DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
      `?ownerUserUniqueId=self&roleId=${usersRoles.driverRoleId}&cancellationReasonsTypeId=${cancellationReasonsType.driverCancel}`,
    {},
    authConfig(driverToken(driverKey)),
  );
  return res.data;
};

const br = {}; // shared state between the BR test steps

// ── TQ-BR1 · One decline cools the whole batch (FIFO auto-dispatch) ───────────

const testBR1DeclineCoolsBatch = async () => {
  try {
    // d1 is the only waiting driver in the main org line (d2/d3/d4 agreed)
    // and has no active journey — a fresh manual check-in gives a LIVE waiting
    // entry at the front of the line.
    await manualCheckin(ORG(), "queueDriver1", qadminToken());
    const e1 = await entryOf("queueDriver1");
    if (!e1 || e1.status !== 1) {
      throw new Error(`normalize check-in failed: ${JSON.stringify(e1)}`);
    }
    br.batchUniqueId = uuidv4();

    // J1 + J2 — one create call with 2 slots groups BOTH request rows under the
    // same batch id (the create engine rejects a SECOND call that reuses a batch
    // id with "All required requests have already been created for this batch",
    // so a multi-row batch must be minted in a single numberOfVehicles>1 call).
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
      numberOfVehicles: 2,
      shipperRequestBatchUniqueId: br.batchUniqueId,
    });

    // Identify the two batch rows: the offered one (journeyStatusId 2, linked
    // to d1's entry) becomes J1, the untouched one (waiting) becomes J2.
    const [newest, oldest] = await getLatestOrders(2);
    const oNew = await getOrderByUniqueId(newest.shipperRequestUniqueId);
    const oOld = await getOrderByUniqueId(oldest.shipperRequestUniqueId);
    const offered = oNew.journeyStatusId === 2 ? oNew : oOld;
    const other = offered === oNew ? oOld : oNew;
    br.j1 = offered.shipperRequestUniqueId;
    br.j2 = other.shipperRequestUniqueId;
    br.j1Order = offered;
    br.j2Order = other;

    // Front driver (d1) is auto-offered J1, then declines it.
    const holder = await entryOf("queueDriver1");
    if (!holder || holder.status !== 2 || holder.shipperRequestUniqueId !== br.j1) {
      throw new Error(`J1 should be offered to d1 first: ${JSON.stringify(holder)}`);
    }
    await rejectOrderByDriver("queueDriver1");

    // d1 → notagreed(18); with no other waiting driver J1 returns to waiting.
    const d1AfterReject = await entryOf("queueDriver1");
    if (!d1AfterReject || d1AfterReject.status !== 18) {
      throw new Error(`d1 should be notagreed(18) after J1 reject: ${JSON.stringify(d1AfterReject)}`);
    }
    const j1After = await getOrderByUniqueId(br.j1);
    if (j1After.journeyStatusId !== journeyStatusMap.waiting) {
      throw new Error(`J1 should be back to waiting (no other driver), got ${j1After.journeyStatusId}`);
    }

    // J2 (SAME batch): d1 is cooled (declined J1) → candidate skipped → the
    // order must still be waiting with zero auto-offers, and d1's entry must
    // keep the terminal 18 (never request J2).
    const j2Order = await getOrderByUniqueId(br.j2);
    if (j2Order.journeyStatusId !== journeyStatusMap.waiting) {
      throw new Error(`J2 (same batch) must stay waiting, got ${j2Order.journeyStatusId}`);
    }
    if ((await getJourneyDecisionCount(br.j2)) !== 0) {
      throw new Error("J2 (same batch) must not be auto-offered to the cooled driver");
    }
    const d1Row = await entryOf("queueDriver1");
    if (d1Row.shipperRequestUniqueId === br.j2 || d1Row.status === 2) {
      throw new Error(`d1 must NOT be auto-reconnected to J2: ${JSON.stringify(d1Row)}`);
    }
    report.pass("TQ-BR1: one decline cools the whole batch (FIFO keeps J2 waiting)");
  } catch (error) {
    report.fail("TQ-BR1: decline cools whole batch", error);
  }
};

// ── TQ-BR2 · Targeted manual dispatch bypasses the cooled batch ───────────────

const testBR2DispatchBypassesCooledBatch = async () => {
  try {
    const d1Entry = await entryOf("queueDriver1");
    if (!d1Entry?.queueUniqueId) {
      throw new Error("d1 entry missing for targeted dispatch");
    }

    // Queue org admin reconnects the cooled d1 to J2 on purpose → allowed.
    const viaEntry = await manualDispatch({
      queueOrganizationUniqueId: ORG(),
      queueUniqueId: d1Entry.queueUniqueId,
      shipperRequestUniqueId: br.j2,
      token: qadminToken(),
    });
    if (viaEntry?.offered !== true) {
      throw new Error(`targeted dispatch of cooled driver failed: ${JSON.stringify(viaEntry)}`);
    }
    const d1After = await entryOf("queueDriver1");
    if (!d1After || d1After.status !== 2 || d1After.shipperRequestUniqueId !== br.j2) {
      throw new Error(`dispatch should reconnect d1 to J2: ${JSON.stringify(d1After)}`);
    }
    report.pass("TQ-BR2: targeted dispatch can reconnect the cooled driver");
  } catch (error) {
    report.fail("TQ-BR2: dispatch bypasses cooled batch", error);
  }
};

// ── TQ-BR3 · Cooling is per-batch; other orders still auto-offer ──────────────

const testBR3CoolingIsPerBatch = async () => {
  try {
    // d1 declines the manually-dispatched J2 too → back to notagreed(18). J2
    // has no other candidate → it reverts to waiting.
    await rejectOrderByDriver("queueDriver1");
    const d1AfterReject = await entryOf("queueDriver1");
    if (!d1AfterReject || d1AfterReject.status !== 18) {
      throw new Error(`d1 should be notagreed(18) after J2 reject: ${JSON.stringify(d1AfterReject)}`);
    }

    // Unrelated single order (its own random batch id): cooled d1 must be
    // auto-offered again — the cooling scope is the DECLINED batch only.
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    br.c = (await getLatestOrders(1))[0].shipperRequestUniqueId;
    const d1Row = await entryOf("queueDriver1");
    if (!d1Row || d1Row.status !== 2 || d1Row.shipperRequestUniqueId !== br.c) {
      throw new Error(`cooled d1 must still be offered a NEW single order: ${JSON.stringify(d1Row)}`);
    }
    report.pass("TQ-BR3: cooling is per-batch — a new single order is still offered");
  } catch (error) {
    report.fail("TQ-BR3: cooling per-batch only", error);
  }
};

// ── Cleanup · restore the exact Pre-AdminOps state ────────────────────────────
//
// AdminOps TQ-33 expects d1 FREE (no live entry, no journey) and NO pending
// typeA order in the main org — otherwise its manual check-in either finds a
// stale entry (idempotent return, wrong refusal/status) or the rescan hands it
// a leftover order (status becomes 2). So end the block by canceling every
// created order and removing d1's entry, one driver line untouched.

const cleanup = async () => {
  try {
    // Release d1 from C (admin cancel → requested entry released to waiting),
    // then retire the unheld J1/J2, then remove d1's entry entirely.
    await cancelOrder({ orderUniqueId: br.c, cancelAs: "admin" });
    await cancelOrder({ orderUniqueId: br.j1, cancelAs: "admin" });
    await cancelOrder({ orderUniqueId: br.j2, cancelAs: "admin" });
    const e1 = await entryOf("queueDriver1");
    if (e1?.queueUniqueId) {
      await removeEntry(e1.queueUniqueId, qadminToken());
    }
    const after = await entryOf("queueDriver1");
    if (after) {
      throw new Error(`d1 should have no live entry after cleanup: ${JSON.stringify(after)}`);
    }
    report.pass("cleanup: d1 free, no pending typeA order (TQ-33 pre-state restored)");
  } catch (error) {
    report.fail("cleanup: restore pre-AdminOps state", error);
  }
};

// ── Entry point ───────────────────────────────────────────────────────────────

const runQueueBatchRuleTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  BATCH REFUSAL RULE — TQ-BR1..TQ-BR3");
  console.log("═══════════════════════════════════════════════════\n");

  await testBR1DeclineCoolsBatch();
  await testBR2DispatchBypassesCooledBatch();
  await testBR3CoolingIsPerBatch();
  await cleanup();
};

module.exports = { runQueueBatchRuleTests };