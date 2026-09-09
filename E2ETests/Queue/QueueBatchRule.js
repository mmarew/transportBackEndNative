"use strict";

// Batch-refusal rule — TQ-BR1..TQ-BR3:
//   A driver who declines ANY order of a batch (statuses 12/16/18) must not be
//   AUTO-offered the batch's OTHER orders (FIFO scan or distance/bid matching),
//   unless the reconnection is a targeted manual dispatch.
//
// Runs AFTER QueueOrders (main org, typeA: d2+d3 agreed from TQ-29). The block
// is self-normalizing: d2/d3 are re-checked-in, driven through the rule, then
// both accept their final orders so they END AGREED — exactly the state
// QueueAdminOps expects ("no typeA driver waiting" in TQ-36).

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
  acceptOrder,
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
 * @param {string} driverKey - Driver key (e.g. "queueDriver2").
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
    // Normalize the main typeA line: re-check-in d2 (front) + d3 (back).
    await manualCheckin(ORG(), "queueDriver2", qadminToken());
    await manualCheckin(ORG(), "queueDriver3", qadminToken());
    const e2 = await entryOf("queueDriver2");
    const e3 = await entryOf("queueDriver3");
    if (!e2 || !e3 || e2.status !== 1 || e3.status !== 1) {
      throw new Error(`normalize check-in failed: ${JSON.stringify({ e2, e3 })}`);
    }
    br.batchUniqueId = uuidv4();

    // J1 — same batch id shared by every job we create in this block.
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
      shipperRequestBatchUniqueId: br.batchUniqueId,
    });
    br.j1 = (await getLatestOrders(1))[0].shipperRequestUniqueId;

    // Front driver (d2) is offered J1, then declines it.
    const holder = await entryOf("queueDriver2");
    if (!holder || holder.status !== 2 || holder.shipperRequestUniqueId !== br.j1) {
      throw new Error(`J1 should be offered to d2 first: ${JSON.stringify(holder)}`);
    }
    await rejectOrderByDriver("queueDriver2");

    // d2 → notagreed(18); J1 advances to the next waiting driver (d3).
    const d2AfterReject = await entryOf("queueDriver2");
    if (!d2AfterReject || d2AfterReject.status !== 18) {
      throw new Error(`d2 should be notagreed(18) after J1 reject: ${JSON.stringify(d2AfterReject)}`);
    }
    const d3Holder = await entryOf("queueDriver3");
    if (!d3Holder || d3Holder.status !== 2 || d3Holder.shipperRequestUniqueId !== br.j1) {
      throw new Error(`J1 should advance to d3: ${JSON.stringify(d3Holder)}`);
    }

    // J2 (SAME batch): d2 is cooled (declined J1) and d3 is holding J1 → no
    // candidate → the order must stay waiting with zero auto-offers, and d2's
    // entry must keep the terminal 18 (never request J2).
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
      shipperRequestBatchUniqueId: br.batchUniqueId,
    });
    br.j2 = (await getLatestOrders(1))[0].shipperRequestUniqueId;
    const j2Order = await getOrderByUniqueId(br.j2);
    if (j2Order.journeyStatusId !== journeyStatusMap.waiting) {
      throw new Error(`J2 (same batch) must stay waiting, got ${j2Order.journeyStatusId}`);
    }
    if ((await getJourneyDecisionCount(br.j2)) !== 0) {
      throw new Error("J2 (same batch) must not be auto-offered to the cooled driver");
    }
    const d2Row = await entryOf("queueDriver2");
    if (d2Row.shipperRequestUniqueId === br.j2 || d2Row.status === 2) {
      throw new Error(`d2 must NOT be auto-reconnected to J2: ${JSON.stringify(d2Row)}`);
    }
    report.pass("TQ-BR1: one decline cools the whole batch (FIFO keeps J2 waiting)");
  } catch (error) {
    report.fail("TQ-BR1: decline cools whole batch", error);
  }
};

// ── TQ-BR2 · Targeted manual dispatch bypasses the cooled batch ───────────────

const testBR2DispatchBypassesCooledBatch = async () => {
  try {
    const d2Entry = await entryOf("queueDriver2");
    if (!d2Entry?.queueUniqueId) {
      throw new Error("d2 entry missing for targeted dispatch");
    }

    // Queue org admin reconnects the cooled d2 to J2 on purpose → allowed.
    const viaEntry = await manualDispatch({
      queueOrganizationUniqueId: ORG(),
      queueUniqueId: d2Entry.queueUniqueId,
      shipperRequestUniqueId: br.j2,
      token: qadminToken(),
    });
    if (viaEntry?.offered !== true) {
      throw new Error(`targeted dispatch of cooled driver failed: ${JSON.stringify(viaEntry)}`);
    }
    const d2After = await entryOf("queueDriver2");
    if (!d2After || d2After.status !== 2 || d2After.shipperRequestUniqueId !== br.j2) {
      throw new Error(`dispatch should reconnect d2 to J2: ${JSON.stringify(d2After)}`);
    }
    report.pass("TQ-BR2: targeted dispatch can reconnect the cooled driver");
  } catch (error) {
    report.fail("TQ-BR2: dispatch bypasses cooled batch", error);
  }
};

// ── TQ-BR3 · Cooling is per-batch; other orders still auto-offer ──────────────

const testBR3CoolingIsPerBatch = async () => {
  try {
    // d2 rejects the manually-dispatched J2 too → back to notagreed(18). J2 has
    // no other candidate (d3 holds J1) → it reverts to waiting, exactly as a
    // normal refused batch advance behaves.
    await rejectOrderByDriver("queueDriver2");
    const d2AfterReject = await entryOf("queueDriver2");
    if (!d2AfterReject || d2AfterReject.status !== 18) {
      throw new Error(`d2 should be notagreed(18) after J2 reject: ${JSON.stringify(d2AfterReject)}`);
    }

    // Unrelated single order (its own random batch id): cooled d2 must be
    // auto-offered again — the cooling scope is the DECLINED batch only.
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    br.c = (await getLatestOrders(1))[0].shipperRequestUniqueId;
    const d2Row = await entryOf("queueDriver2");
    if (!d2Row || d2Row.status !== 2 || d2Row.shipperRequestUniqueId !== br.c) {
      throw new Error(`cooled d2 must still be offered a NEW single order: ${JSON.stringify(d2Row)}`);
    }
    report.pass("TQ-BR3: cooling is per-batch — a new single order is still offered");
  } catch (error) {
    report.fail("TQ-BR3: cooling per-batch only", error);
  }
};

// ── Wrap-up · restore drivers to AGREED state (as TQ-29 left them) ────────────

const restoreDriversAgreed = async () => {
  try {
    // d3 holds J1, d2 holds C → both accept → both entries agreed(3).
    const a2 = await acceptOrder("queueDriver2");
    const a3 = await acceptOrder("queueDriver3");
    if (!a2 || !a3) {
      throw new Error("wrap-up accepts failed");
    }
    const e2 = await entryOf("queueDriver2");
    const e3 = await entryOf("queueDriver3");
    if (!e2 || e2.status !== 3 || !e3 || e3.status !== 3) {
      throw new Error(`wrap-up should leave d2/d3 agreed: ${JSON.stringify({ e2, e3 })}`);
    }
    report.pass("wrap-up: d2/d3 restored to agreed (QueueAdminOps sees no waiting typeA driver)");
  } catch (error) {
    report.fail("wrap-up: restore d2/d3 agreed", error);
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
  await restoreDriversAgreed();
};

module.exports = { runQueueBatchRuleTests };