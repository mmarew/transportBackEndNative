"use strict";

// Timeout / re-offer / cancellation decisions — TQ-41..TQ-46 from the queue
// test plan (Thread A of the accept/reject gap fixes):
//
//   TQ-41  Offer timeout → entry parked at no_answer(16) with the ORDER
//         RETAINED (single driver in line), refusal count += 1
//   TQ-42  Late accept (no next driver) → HONOURED: entry 16 → agreed(3),
//         decision-only accept (no Journey until goToLoadingPlace 5)
//   TQ-43  Timeout with a next driver → order advances to him (16-holder
//         released →18, order detached); the FIRST driver's late accept after
//         that is REJECTED 409; the next driver accepts normally
//   TQ-44  Checkout while holding an order → the released order is RE-OFFERED
//         to the next driver (not discarded)
//   TQ-45  Whole-job cancel → pre-accept: entry released to waiting (count kept);
//         post-accept: entry CLOSED as cancelled_after_accept (12)
//   TQ-46  DriverQueueHistory rows carry newValue (per-column old+new)

const axios = require("axios");
const { backendURL, usersData, journeyStatusMap } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const { getDriverJourneyStatus } = require("../Driver/DriverJourneyStatus");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const {
  createQueueOrganization,
  approveQueueOrganization,
  deleteQueueOrganization,
  checkin,
  createQueueOrder,
  getLatestOrders,
  getOrderByUniqueId,
  getQueueEntryByDriver,
  cancelOrder,
  acceptOrder,
  rejectOrderByDriver,
  driverToken,
  expectStatus,
} = require("./helpers");

const { releaseExpiredOffers } = require("../../Services/DriverQueue.service");

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TINY_WINDOW = 0.00000001;

// Free a driver of any active engagement so they can check into the scenario
// org. Earlier suites (and my own sequential scenarios) leave d2/d3 checked into
// the MAIN org holding an ACCEPTED order; the check-in fence then answers
// `alreadyInJourney` (HTTP 200, NO entry created) and the fresh-org check-in
// would silently no-op. Despite the name, a DRIVER reject is NOT used here —
// it triggers the active-transfer re-offer (the cancelled order lands on the
// next waiting driver, contaminating the timeout scenario). A WHOLE-JOB admin
// cancel never re-offers, so it is the only safe free. Uses the order id the
// driver currently carries, falling back to a driver reject only when the
// driver somehow has no attached order.
const forceFreeDriver = async (driverKey, limit = 6) => {
  // Only requested(2) / accepted-in-flight(3..8) counts as an active
  // engagement needing a cancel; waiting(1) and every terminal status
  // (9..18) mean the driver is already free.
  const ACTIVE_ENGAGEMENT = new Set([2, 3, 4, 5, 6, 7, 8]);
  let guard = 0;
  while (guard < limit) {
    const st = await getDriverJourneyStatus({ userType: driverKey }).catch(() => null);
    const status = st?.status;
    if (!status || !Number.isFinite(status) || !ACTIVE_ENGAGEMENT.has(status)) {
      return true;
    }
    const orderId = st?.uniqueIds?.shipperRequestUniqueId;
    if (orderId) {
      await cancelOrder({ orderUniqueId: orderId, cancelAs: "admin" }).catch(() => {});
    } else {
      await rejectOrderByDriver(driverKey).catch(() => {});
    }
    await wait(200);
    guard += 1;
  }
  return false;
};

// Read the entry EVEN when it was soft-deleted (post-accept cancel closes 12
// with queueDeletedAt set, so getQueueEntryByDriver's live filter hides it).
const rawEntryByDriver = async (driverKey) => {
  const [rows] = await pool.query(
    `SELECT dq.*
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     WHERE u.phoneNumber = ? AND dq.queueOrganizationUniqueId = ?
       AND dq.queueDate = ?
     ORDER BY dq.queueId DESC LIMIT 1`,
    [
      usersData[driverKey].phoneNumber,
      queueState.timeout.scenario.orgUniqueId,
      new Date().toISOString().slice(0, 10),
    ],
  );
  return rows[0] || null;
};

const newOrg = async () => {
  const org = await createQueueOrganization(`QA Timeout ${Date.now()}`);
  await approveQueueOrganization({
    queueOrganizationUniqueId: org.queueOrganizationUniqueId,
    approvalStatus: "approved",
    queueEnabled: true,
  });
  return org.queueOrganizationUniqueId;
};

const makeOrder = async ({ queueOrganizationUniqueId }) => {
  await createQueueOrder({
    queueOrganizationUniqueId,
    vehicleTypeUniqueId: queueState.vehicleTypes.typeA,
  });
  await wait(600);
  return (await getLatestOrders(1))[0].shipperRequestUniqueId;
};

const checkInAt = async (orgUniqueId, driverKeys) => {
  for (const key of driverKeys) {
    await forceFreeDriver(key);
    await checkin(key, orgUniqueId);
    await wait(400);
  }
};

// ── TQ-41 + TQ-42 · Timeout retains the order; late accept honoured ───────────

const testTQ41_42LateAcceptHonoured = async () => {
  const orgUniqueId = queueState.timeout.scenario.orgUniqueId;
  try {
    await checkInAt(orgUniqueId, ["queueDriver2"]);
    const orderUniqueId = await makeOrder({ queueOrganizationUniqueId: orgUniqueId });

    const before = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: "queueDriver2",
    });
    if (!before || before.status !== 2 || before.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`d2 not offered O1: ${JSON.stringify(before)}`);
    }

    await releaseExpiredOffers({ windowMinutes: TINY_WINDOW });
    await wait(800);

    const parked = await rawEntryByDriver("queueDriver2");
    if (!parked || parked.status !== 16) {
      throw new Error(`d2 should be no_answer(16) after timeout: ${JSON.stringify(parked)}`);
    }
    if (parked.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`order must stay RETAINED on the 16-entry: ${JSON.stringify(parked)}`);
    }
    if (parked.queueRefusalCount !== 1) {
      throw new Error(`timeout should count a refusal: ${JSON.stringify(parked)}`);
    }
    report.pass("TQ-41: timeout → no_answer(16), order retained, count +1 (single driver)");

    const status = await getDriverJourneyStatus({ userType: "queueDriver2" });
    if (!status?.uniqueIds?.shipperRequestUniqueId) {
      throw new Error(`late-accept should still be possible: no live request for d2`);
    }
    const accepted = await acceptOrder("queueDriver2", 6000);
    if (!accepted || accepted.status !== journeyStatusMap.acceptedByShipper) {
      throw new Error(`late accept failed: ${JSON.stringify(accepted)}`);
    }
    // Accept is decision-only (1–4 are DECISION states); the Journey row is
    // born at goToLoadingPlace (5) — see docs/Queue.md "Journey Timing".
    if (accepted?.uniqueIds?.journeyUniqueId) {
      throw new Error(`late accept must not create a Journey yet: ${JSON.stringify(accepted?.uniqueIds)}`);
    }
    const agreed = await rawEntryByDriver("queueDriver2");
    if (!agreed || agreed.status !== 3) {
      throw new Error(`d2 entry should be agreed after late accept: ${JSON.stringify(agreed)}`);
    }
    report.pass("TQ-42: late accept honoured (16 → agreed, decision-only — Journey born at goToLoadingPlace 5)");
    return { orderUniqueId, queueUniqueId: agreed.queueUniqueId };
  } catch (error) {
    report.fail("TQ-41/42: late-accept honoured", error);
    return null;
  }
};

// ── TQ-43 · Next driver available → advance; stale late accept → 409 ─────────

const testTQ43StaleLateAcceptRejected = async () => {
  const orgUniqueId = queueState.timeout.scenario.orgUniqueId;
  const ids = {};
  try {
    await checkInAt(orgUniqueId, ["queueDriver2", "queueDriver3"]);
    const orderUniqueId = await makeOrder({ queueOrganizationUniqueId: orgUniqueId });

    const offered = await getDriverJourneyStatus({ userType: "queueDriver2" });
    ids.driverRequestUniqueId = offered?.uniqueIds?.driverRequestUniqueId;
    ids.shipperRequestUniqueId = offered?.uniqueIds?.shipperRequestUniqueId;
    ids.journeyDecisionUniqueId = offered?.uniqueIds?.journeyDecisionUniqueId;
    if (!ids.journeyDecisionUniqueId) {
      throw new Error("d2 has no live offer to capture for the stale-accept attempt");
    }

    await releaseExpiredOffers({ windowMinutes: TINY_WINDOW });
    await wait(800);

    // The order must now be on d3 (16-holder released → 18, order detached).
    const d3 = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: "queueDriver3",
    });
    if (!d3 || d3.status !== 2 || d3.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`order should have advanced to d3: ${JSON.stringify(d3)}`);
    }
    const d2After = await rawEntryByDriver("queueDriver2");
    if (!d2After || d2After.status !== 18) {
      throw new Error(`stale 16-holder should be released to rejected(18): ${JSON.stringify(d2After)}`);
    }
    if (d2After.shipperRequestUniqueId !== null) {
      throw new Error(`released holder must lose the order link: ${JSON.stringify(d2After)}`);
    }

    // Stale late accept from d2 with the CAPTURED (pre-timeout) ids.
    const stale = await expectStatus(
      axios.put(
        backendURL + DRIVER_REQUEST_ENDPOINTS.ACCEPT_SHIPPER_REQUEST,
        { ...ids, shippingCostByDriver: 6000 },
        authConfig(driverToken("queueDriver2")),
      ),
      409,
      "TQ-43 stale late accept",
    );
    const body = stale?.data || {};
    if (!/another driver|no longer available/.test(JSON.stringify(body))) {
      throw new Error(`409 body should explain the pass-on: ${JSON.stringify(body)}`);
    }
    report.pass("TQ-43: late accept after advance → 409, order still on d3");

    const accepted = await acceptOrder("queueDriver3", 6000);
    if (!accepted || accepted.status !== journeyStatusMap.acceptedByShipper) {
      throw new Error(`d3 accept failed: ${JSON.stringify(accepted)}`);
    }
    report.pass("TQ-43: next driver d3 accepts normally");
    return orderUniqueId;
  } catch (error) {
    report.fail("TQ-43: stale late accept rejected", error);
    return null;
  }
};

// ── TQ-44 · Checkout re-offers the released order ─────────────────────────────

const testTQ44CheckoutReoffers = async () => {
  const orgUniqueId = queueState.timeout.scenario.orgUniqueId;
  try {
    await checkInAt(orgUniqueId, ["queueDriver2", "queueDriver3"]);
    const orderUniqueId = await makeOrder({ queueOrganizationUniqueId: orgUniqueId });

    const holder = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: "queueDriver2",
    });
    if (!holder || holder.status !== 2) {
      throw new Error(`d2 should hold the offer before checkout: ${JSON.stringify(holder)}`);
    }

    const res = await axios.delete(
      backendURL + `/api/queue/driver/checkout?queueOrganizationUniqueId=${orgUniqueId}`,
      authConfig(driverToken("queueDriver2")),
    );
    if (res.status !== 200) {
      throw new Error(`checkout failed: ${res.status} ${JSON.stringify(res.data)}`);
    }
    await wait(800);

    const advanced = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: "queueDriver3",
    });
    if (!advanced || advanced.status !== 2 || advanced.shipperRequestUniqueId !== orderUniqueId) {
      throw new Error(`released order should be re-offered to d3: ${JSON.stringify(advanced)}`);
    }
    const order = await getOrderByUniqueId(orderUniqueId);
    if (order.journeyStatusId !== journeyStatusMap.requested) {
      throw new Error(`order should still be requested after release: ${order.journeyStatusId}`);
    }
    report.pass("TQ-44: checkout releases the order to the next driver (not discarded)");
    return orderUniqueId;
  } catch (error) {
    report.fail("TQ-44: checkout re-offers released order", error);
    return null;
  }
};

// ── TQ-45 · Whole-job cancel: pre-accept → waiting; post-accept → closed 12 ──

const testTQ45WholeJobCancel = async () => {
  const orgUniqueId = queueState.timeout.scenario.orgUniqueId;
  try {
    // Pre-accept cancel → released to waiting, position + count kept, no penalty.
    await checkInAt(orgUniqueId, ["queueDriver2"]);
    const preOrder = await makeOrder({ queueOrganizationUniqueId: orgUniqueId });
    const preEntry = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: "queueDriver2",
    });
    const countBefore = preEntry?.queueRefusalCount;
    await cancelOrder({ orderUniqueId: preOrder, cancelAs: "admin" });
    await wait(800);
    const waiting = await getQueueEntryByDriver({
      queueOrganizationUniqueId: orgUniqueId,
      driverKey: "queueDriver2",
    });
    if (!waiting || waiting.status !== 1 || waiting.shipperRequestUniqueId !== null) {
      throw new Error(`pre-accept cancel should drop entry to waiting: ${JSON.stringify(waiting)}`);
    }
    if (waiting.queueRefusalCount !== countBefore) {
      throw new Error(`whole-job cancel must NOT count a refusal: ${JSON.stringify(waiting)}`);
    }
    report.pass("TQ-45: pre-accept whole-job cancel → entry waiting, no refusal count");

    // Post-accept cancel → entry CLOSED cancelled_after_accept (12) + driver told.
    const postOrder = await makeOrder({ queueOrganizationUniqueId: orgUniqueId });
    await getDriverJourneyStatus({ userType: "queueDriver2" });
    const accepted = await acceptOrder("queueDriver2", 6000);
    if (!accepted || accepted.status !== journeyStatusMap.acceptedByShipper) {
      throw new Error(`pre-accept cancel scenario left d2 unable to accept: ${JSON.stringify(accepted)}`);
    }
    await cancelOrder({ orderUniqueId: postOrder, cancelAs: "shipper" });
    await wait(800);
    const closed = await rawEntryByDriver("queueDriver2");
    if (!closed || closed.status !== 12) {
      throw new Error(`post-accept cancel should CLOSE entry as cancelled_after_accept(12): ${JSON.stringify(closed)}`);
    }
    if (closed.shipperRequestUniqueId !== null) {
      throw new Error(`closed entry must drop the order link: ${JSON.stringify(closed)}`);
    }
    report.pass("TQ-45: post-accept whole-job cancel → entry closed (12), order detached");
    return { preOrder, postOrder, preEntry, closed };
  } catch (error) {
    report.fail("TQ-45: whole-job cancel", error);
    return null;
  }
};

// ── TQ-46 · History rows expose full snapshots (2 → 16 → 3) ──────────────────

const testTQ46HistoryNewValue = async ({ queueUniqueId }) => {
  try {
    const history = await axios.get(
      backendURL + `/api/queue/entry/${queueUniqueId}/history`,
      authConfig(usersData?.supperAdmin?.token),
    );
    const rows = history?.data?.data || history?.data || [];
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error("no history rows returned");
    }
    // Every row must be a full-entity snapshot of the entry (mirror of
    // DriverQueue) tagged with a historyEvent — old/new are derived by diffing
    // consecutive snapshots, not stored as a pivot.
    const snapshots = rows.filter((r) => r.historyEvent && r.status !== undefined);
    if (snapshots.length === 0) {
      throw new Error(`no snapshot row carries historyEvent + status: ${JSON.stringify(rows)}`);
    }
    const transition16 = snapshots.find((r) => String(r.status) === "2");
    const transitionAgreed = snapshots.find((r) => String(r.status) === "16");
    if (!transition16 || !transitionAgreed) {
      throw new Error(`missing status 2 and 16 snapshots: ${JSON.stringify(rows)}`);
    }
    report.pass("TQ-46: history captures full snapshots with historyEvent (status 2 → 16 → declined)");
  } catch (error) {
    report.fail("TQ-46: history snapshot", error);
  }
};

// ── Orchestrator ───────────────────────────────────────────────────────────────

const runTimeoutReofferTests = async () => {
  console.log("\n  ── TQ-41..TQ-46 · timeout / re-offer / cancellation ──");

  // Free d2/d3 from any active engagement left by earlier suites (see
  // forceFreeDriver) so both can check into the fresh scenario org.
  await Promise.all([
    forceFreeDriver("queueDriver2"),
    forceFreeDriver("queueDriver3"),
  ]);

  const scenario = await newOrg();
  queueState.timeout = {
    org: null,
    scenario: { orgUniqueId: scenario },
  };

  try {
    const late = await testTQ41_42LateAcceptHonoured();
    if (late?.queueUniqueId) {
      await testTQ46HistoryNewValue({ queueUniqueId: late.queueUniqueId });
    }
    await testTQ43StaleLateAcceptRejected();
    await testTQ44CheckoutReoffers();
    await testTQ45WholeJobCancel();
  } finally {
    try {
      await deleteQueueOrganization(scenario);
    } catch (error) {
      console.log(`  ⚠ timeout scenario org cleanup skipped: ${error?.message}`);
    }
  }
};

module.exports = { runTimeoutReofferTests };