"use strict";

// Order lifecycle against a queue-enabled organization — TQ-11..TQ-32 from the
// queue test plan: auto-dispatch & offer, accept flow, reject & advance,
// refusal policy, whole-job cancellation, batch orders, concurrency.

const axios = require("axios");
const { backendURL, usersData } = require("../constants");
const { authConfig } = require("../Utils");
const { pool } = require("../../Middleware/Database.config");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const {
  getDriverJourneyStatus,
} = require("../Driver/DriverJourneyStatus");
const {
  DRIVER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/driverRequest.endpoints");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const {
  createQueueOrder,
  buildQueueOrderPayload,
  rejectDriverOffer,
  cancelOrder,
  acceptOrder,
  rejectOrderByDriver,
  checkin,
  getLatestOrders,
  getOrderByUniqueId,
  getJourneyDecisionCount,
  getCanceledJourneysForOrder,
  getQueueEntryByDriver,
  getActiveQueueCountForDriver,
  driverToken,
  shipperToken,
  dbToday,
  expectStatus,
} = require("./helpers");

const ORG = () => queueState.org.main.queueOrganizationUniqueId;
const typeA = () => queueState.vehicleTypes.typeA;
const typeB = () => queueState.vehicleTypes.typeB;
const typeC = () => queueState.vehicleTypes.typeC;

const entryOf = (driverKey) =>
  getQueueEntryByDriver({ queueOrganizationUniqueId: ORG(), driverKey });

const offerIds = (driverKey) =>
  usersData[driverKey]?.journeyStatus?.uniqueIds || {};

const rawAccept = async (driverKey, ids, shippingCostByDriver = 5500) => {
  const res = await axios.put(
    backendURL + DRIVER_REQUEST_ENDPOINTS.ACCEPT_SHIPPER_REQUEST,
    {
      driverRequestUniqueId: ids.driverRequestUniqueId,
      shipperRequestUniqueId: ids.shipperRequestUniqueId,
      journeyDecisionUniqueId: ids.journeyDecisionUniqueId,
      shippingCostByDriver,
    },
    authConfig(driverToken(driverKey)),
  );
  return res;
};

const rawDriverReject = async (driverKey) => {
  const res = await axios.put(
    backendURL +
      DRIVER_REQUEST_ENDPOINTS.CANCEL_DRIVER_REQUEST +
      "?ownerUserUniqueId=self&roleId=2&cancellationReasonsTypeId=2",
    {},
    authConfig(driverToken(driverKey)),
  );
  return res;
};

const orders = {};

// ── TQ-11 · Auto-dispatch offers the front driver ─────────────────────────────

const testTQ11AutoOfferFront = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    orders.O_A = await (await getLatestOrders(1))[0].shipperRequestUniqueId;

    await getDriverJourneyStatus({ userType: "queueDriver2" });
    const ids = offerIds("queueDriver2");
    if (!ids.driverRequestUniqueId || !ids.journeyDecisionUniqueId) {
      throw new Error("d2 has no active offer after O_A creation");
    }

    const e2 = await entryOf("queueDriver2");
    if (!e2 || e2.status !== "offered" || e2.shipperRequestUniqueId !== orders.O_A) {
      throw new Error(`d2 not offered O_A: ${JSON.stringify(e2)}`);
    }
    if ((await getJourneyDecisionCount(orders.O_A)) !== 1) {
      throw new Error("O_A should have exactly 1 decision");
    }
    report.pass("TQ-11: auto-dispatch offers front driver (d2 offered O_A)");
  } catch (error) {
    report.fail("TQ-11: auto-dispatch front offer", error);
  }
};

// ── TQ-15 · Driver accepts → leaves queue (loaded), order in transit ──────────

const testTQ15AcceptLeavesQueue = async () => {
  try {
    const accepted = await acceptOrder("queueDriver2", 6000);
    if (!accepted || accepted.status !== 3) {
      throw new Error(`accept failed: ${JSON.stringify(accepted)}`);
    }
    const e2 = await entryOf("queueDriver2");
    if (!e2 || e2.status !== "loaded") {
      throw new Error(`d2 entry should be loaded: ${JSON.stringify(e2)}`);
    }
    const order = await getOrderByUniqueId(orders.O_A);
    if (order.journeyStatusId !== 3) {
      throw new Error(`O_A should be acceptedByDriver(3), got ${order.journeyStatusId}`);
    }
    report.pass("TQ-15: driver accepts → entry loaded, order acceptedByDriver");
  } catch (error) {
    report.fail("TQ-15: driver accept leaves queue", error);
  }
};

// ── TQ-16 · Repeat accept on already-accepted order → 4xx, no side effects ────

const testTQ16RepeatAcceptDenied = async () => {
  try {
    const ids = offerIds("queueDriver2");
    await expectStatus(
      rawAccept("queueDriver2", ids, 6000),
      400,
      "TQ-16 repeat accept",
    );
    report.pass("TQ-16: repeat accept on accepted order denied (400)");
  } catch (error) {
    report.fail("TQ-16: repeat accept denied", error);
  }
};

// ── TQ-17 · Driver not offered the order is denied accept ─────────────────────

const testTQ17NonOfferedDriverDenied = async () => {
  try {
    const ids = offerIds("queueDriver2");
    await expectStatus(
      rawAccept("queueDriver3", ids, 6000),
      [400, 403],
      "TQ-17 not-offered driver accept",
    );
    report.pass("TQ-17: non-offered driver accept denied (4xx)");
  } catch (error) {
    report.fail("TQ-17: non-offered driver accept denied", error);
  }
};

// ── TQ-13 · Driver holding another offer is skipped (d2 loaded) ───────────────

const testTQ13SkipHoldingDriver = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    orders.O_B = await (await getLatestOrders(1))[0].shipperRequestUniqueId;

    await getDriverJourneyStatus({ userType: "queueDriver3" });
    const ids = offerIds("queueDriver3");
    if (!ids.driverRequestUniqueId || !ids.journeyDecisionUniqueId) {
      throw new Error("d3 has no active offer after O_B creation");
    }

    const e3 = await entryOf("queueDriver3");
    if (!e3 || e3.status !== "offered" || e3.shipperRequestUniqueId !== orders.O_B) {
      throw new Error(`d3 not offered O_B: ${JSON.stringify(e3)}`);
    }
    const e2 = await entryOf("queueDriver2");
    if (!e2 || e2.status !== "loaded") {
      throw new Error(`d2 (loaded) should NOT hold O_B: ${JSON.stringify(e2)}`);
    }
    report.pass("TQ-13: holding/loaded driver skipped — next driver offered");
  } catch (error) {
    report.fail("TQ-13: skip holding driver", error);
  }
};

// ── TQ-12 · Order with no matching vehicle type stays waiting ─────────────────

const testTQ12NoMatchingTypeStaysWaiting = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeC(),
    });
    orders.O_C = await (await getLatestOrders(1))[0].shipperRequestUniqueId;

    const order = await getOrderByUniqueId(orders.O_C);
    if (order.journeyStatusId !== 1) {
      throw new Error(`O_C should be waiting(1), got ${order.journeyStatusId}`);
    }
    if ((await getJourneyDecisionCount(orders.O_C)) !== 0) {
      throw new Error("O_C should have 0 decisions");
    }
    const [offeredRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM DriverQueue
       WHERE shipperRequestUniqueId = ? AND queueDeletedAt IS NULL`,
      [orders.O_C],
    );
    if (offeredRows[0].total !== 0) {
      throw new Error("O_C should not be linked to any queue entry");
    }
    report.pass("TQ-12: no matching vehicle type → order stays waiting");
  } catch (error) {
    report.fail("TQ-12: no matching type stays waiting", error);
  }
};

// ── TQ-19 · Shipper price-reject counts refusal, keeps driver position ────────

const testTQ19ShipperPriceReject = async () => {
  try {
    const d3 = await entryOf("queueDriver3");
    const order = await getOrderByUniqueId(orders.O_B);
    const ids = offerIds("queueDriver3");
    const res = await rejectDriverOffer({
      shipperRequestUniqueId: orders.O_B,
      driverRequestUniqueId: ids.driverRequestUniqueId,
      journeyDecisionUniqueId: ids.journeyDecisionUniqueId,
      shipperRequestId: order.shipperRequestId,
      journeyStatusId: 2,
    });
    if (!res || res.message !== "Driver offer rejected successfully") {
      throw new Error(`shipper reject failed: ${JSON.stringify(res)}`);
    }

    const after = await entryOf("queueDriver3");
    if (!after || after.queueRefusalCount !== 1 || after.status !== "waiting" || after.shipperRequestUniqueId) {
      throw new Error(`d3 refusal state wrong after shipper reject: ${JSON.stringify(after)}`);
    }
    if (after.queueNumber !== d3.queueNumber) {
      throw new Error(`d3 should keep position ${d3.queueNumber}, got ${after.queueNumber}`);
    }
    const o = await getOrderByUniqueId(orders.O_B);
    if (o.journeyStatusId !== 1) {
      throw new Error(`O_B should be waiting(1) — no next driver, got ${o.journeyStatusId}`);
    }
    report.pass("TQ-19: shipper price-reject → refusalCount 1, position kept, order waits");
  } catch (error) {
    report.fail("TQ-19: shipper price-reject", error);
  }
};

// ── TQ-18 · Driver rejects pre-accept → order advances, count +1 ──────────────

const testTQ18DriverRejectAdvances = async () => {
  try {
    // d2 (loaded after TQ-15) is free → re-checks-in at the back.
    await checkin("queueDriver2", ORG());
    const reEntry = await entryOf("queueDriver2");
    if (!reEntry || reEntry.status !== "waiting" || reEntry.queueRefusalCount !== 0) {
      throw new Error(`d2 re-check-in failed: ${JSON.stringify(reEntry)}`);
    }

    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    orders.O_D = await (await getLatestOrders(1))[0].shipperRequestUniqueId;

    const e3 = await entryOf("queueDriver3");
    if (!e3 || e3.status !== "offered" || e3.shipperRequestUniqueId !== orders.O_D) {
      throw new Error(`d3 should be offered O_D (front), got ${JSON.stringify(e3)}`);
    }
    const d3Before = e3.queueRefusalCount;

    await expectStatus(rawDriverReject("queueDriver3"), 200, "TQ-18 d3 reject");

    const d3After = await entryOf("queueDriver3");
    if (!d3After || d3After.queueRefusalCount !== d3Before + 1 || d3After.status !== "waiting") {
      throw new Error(`d3 refusal not incremented/released: ${JSON.stringify(d3After)}`);
    }
    const e2 = await entryOf("queueDriver2");
    if (!e2 || e2.status !== "offered" || e2.shipperRequestUniqueId !== orders.O_D) {
      throw new Error(`O_D should advance to d2: ${JSON.stringify(e2)}`);
    }
    report.pass("TQ-18: driver reject pre-accept → order advances, refusal +1");
  } catch (error) {
    report.fail("TQ-18: driver reject advances order", error);
  }
};

// ── TQ-21 · Empty queue after reject → order stays waiting ────────────────────

const testTQ21EmptyQueueStaysWaiting = async () => {
  try {
    await expectStatus(rawDriverReject("queueDriver2"), 200, "TQ-21 d2 reject");

    const e2 = await entryOf("queueDriver2");
    if (!e2 || e2.queueRefusalCount !== 1 || e2.status !== "waiting" || e2.shipperRequestUniqueId) {
      throw new Error(`d2 refusal state wrong: ${JSON.stringify(e2)}`);
    }
    const o = await getOrderByUniqueId(orders.O_D);
    if (o.journeyStatusId !== 1) {
      throw new Error(`O_D should stay waiting(1), got ${o.journeyStatusId}`);
    }
    const [offeredRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM DriverQueue
       WHERE shipperRequestUniqueId = ? AND status = 'offered' AND queueDeletedAt IS NULL`,
      [orders.O_D],
    );
    if (offeredRows[0].total !== 0) {
      throw new Error("O_D must not be offered after empty-queue reject");
    }
    report.pass("TQ-21: empty queue after reject → order stays waiting, no offer");
  } catch (error) {
    report.fail("TQ-21: empty queue after reject", error);
  }
};

// ── TQ-22 · Repeated reject → no double state change ──────────────────────────

const testTQ22RepeatedRejectNoop = async () => {
  try {
    // d3's older rejected-by-shipper request (O_B) still counts as "active"
    // until marked seen — clear it so the repeat reject hits "no active request".
    const [drRows] = await pool.query(
      `SELECT dr.driverRequestUniqueId
       FROM DriverRequest dr
       JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       WHERE sr.shipperRequestUniqueId = ? LIMIT 1`,
      [orders.O_B],
    );
    if (drRows.length > 0) {
      await axios.put(
        backendURL + DRIVER_REQUEST_ENDPOINTS.MARK_NEGATIVE_STATUS_AS_SEEN,
        { driverRequestUniqueId: drRows[0].driverRequestUniqueId },
        authConfig(driverToken("queueDriver3")),
      );
    }

    const d3Before = await entryOf("queueDriver3");
    const decisionsBefore = await getJourneyDecisionCount(orders.O_D);
    const canceledBefore = (await getCanceledJourneysForOrder(orders.O_D)).length;

    // No active request left for d3 → 4xx and NO state change.
    await expectStatus(
      rawDriverReject("queueDriver3"),
      404,
      "TQ-22 repeated reject",
    );

    const d3After = await entryOf("queueDriver3");
    if (d3After.queueRefusalCount !== d3Before.queueRefusalCount) {
      throw new Error("repeated reject incremented refusal count");
    }
    if ((await getJourneyDecisionCount(orders.O_D)) !== decisionsBefore) {
      throw new Error("repeated reject added a decision");
    }
    if ((await getCanceledJourneysForOrder(orders.O_D)).length !== canceledBefore) {
      throw new Error("repeated reject added a CanceledJourneys row");
    }
    const o = await getOrderByUniqueId(orders.O_D);
    if (o.journeyStatusId !== 1) {
      throw new Error(`O_D changed state on repeated reject: ${o.journeyStatusId}`);
    }
    report.pass("TQ-22: repeated reject → 4xx, no refusal/advance side effects");
  } catch (error) {
    report.fail("TQ-22: repeated reject no-op", error);
  }
};

// ── TQ-24 · Below refusal limit → stays at front ──────────────────────────────

const testTQ24BelowLimitStaysFront = async () => {
  try {
    for (let i = 1; i <= 2; i++) {
      await createQueueOrder({
        queueOrganizationUniqueId: ORG(),
        vehicleTypeUniqueId: typeB(),
      });
      orders["O_E" + i] = await (await getLatestOrders(1))[0].shipperRequestUniqueId;
      const e4 = await entryOf("queueDriver4");
      if (!e4 || e4.status !== "offered" || e4.shipperRequestUniqueId !== orders["O_E" + i]) {
        throw new Error(`d4 not offered O_E${i}: ${JSON.stringify(e4)}`);
      }
      await expectStatus(rawDriverReject("queueDriver4"), 200, `TQ-24 d4 reject ${i}`);
    }
    const e4 = await entryOf("queueDriver4");
    if (!e4 || e4.queueRefusalCount !== 2 || e4.queueNumber !== 1 || e4.status !== "waiting") {
      throw new Error(`d4 should be count=2 at #1, got ${JSON.stringify(e4)}`);
    }
    report.pass("TQ-24: below limit (count 2) → stays at front, position kept");
  } catch (error) {
    report.fail("TQ-24: below limit stays front", error);
  }
};

// ── TQ-23 · Consecutive refusals move driver to back, counter resets ──────────

const testTQ23RefusalLimitMovesToBack = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeB(),
    });
    orders.O_E3 = await (await getLatestOrders(1))[0].shipperRequestUniqueId;

    const e4 = await entryOf("queueDriver4");
    if (!e4 || e4.status !== "offered" || e4.shipperRequestUniqueId !== orders.O_E3) {
      throw new Error(`d4 not offered O_E3: ${JSON.stringify(e4)}`);
    }
    await expectStatus(rawDriverReject("queueDriver4"), 200, "TQ-23 d4 3rd reject");

    const after = await entryOf("queueDriver4");
    if (!after || after.queueRefusalCount !== 0) {
      throw new Error(`d4 refusal counter should reset to 0: ${JSON.stringify(after)}`);
    }
    if (after.queueNumber <= 1) {
      throw new Error(`d4 should move to back (queueNumber > 1), got ${after.queueNumber}`);
    }
    if (after.status !== "waiting") {
      throw new Error(`d4 should stay in queue (waiting), got ${after.status}`);
    }
    const o = await getOrderByUniqueId(orders.O_E3);
    if (o.journeyStatusId !== 1) {
      throw new Error(`O_E3 should stay waiting, got ${o.journeyStatusId}`);
    }
    report.pass("TQ-23: 3rd refusal → moved to back, counter reset, stays in queue");
  } catch (error) {
    report.fail("TQ-23: refusal limit moves to back", error);
  }
};

// ── TQ-25 · Shipper cancels whole job → releases entry, no refusal count ──────

const testTQ25ShipperCancelReleases = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    orders.O_F = await (await getLatestOrders(1))[0].shipperRequestUniqueId;

    const e3 = await entryOf("queueDriver3");
    if (!e3 || e3.status !== "offered" || e3.shipperRequestUniqueId !== orders.O_F) {
      throw new Error(`d3 not offered O_F: ${JSON.stringify(e3)}`);
    }
    const countBefore = e3.queueRefusalCount;

    await cancelOrder({ orderUniqueId: orders.O_F, cancelAs: "shipper" });

    const after = await entryOf("queueDriver3");
    if (!after || after.status !== "waiting" || after.shipperRequestUniqueId) {
      throw new Error(`d3 entry not released on shipper cancel: ${JSON.stringify(after)}`);
    }
    if (after.queueRefusalCount !== countBefore) {
      throw new Error("whole-job cancel must NOT count a refusal");
    }
    const o = await getOrderByUniqueId(orders.O_F);
    if (o.journeyStatusId !== 7) {
      throw new Error(`O_F should be cancelledByShipper(7), got ${o.journeyStatusId}`);
    }
    report.pass("TQ-25: shipper cancel releases entry, no refusal count");
  } catch (error) {
    report.fail("TQ-25: shipper whole-job cancel", error);
  }
};

// ── TQ-26 · Queue admin (role 11) cancels whole job ───────────────────────────

const testTQ26QueueAdminCancel = async () => {
  try {
    const res = await axios.put(
      backendURL +
        SHIPPER_REQUEST_ENDPOINTS.CANCEL_SHIPPER_REQUEST.replace(
          ":userUniqueId",
          queueState.shipper.userUniqueId,
        ),
      { shipperRequestUniqueId: orders.O_D, cancellationReasonsTypeId: 6 },
      authConfig(usersData.queueOrgAdmin?.token),
    );
    if (res.status !== 200) {
      throw new Error(`queue admin cancel should be allowed per docs, got ${res.status}`);
    }
    report.pass("TQ-26: queue admin (role 11) can cancel whole job");
  } catch (error) {
    if (error.response && error.response.status === 403) {
      report.fail(
        "TQ-26: queue admin (role 11) cancel — 403. Docs say qadmin can cancel live orders, but verifyCancelShipperRequestAuthorization only allows owner/admin(3)/superadmin(6). Code gap.",
        error,
      );
    } else {
      report.fail("TQ-26: queue admin whole-job cancel", error);
    }
  }
};

// ── TQ-27 · Platform admin cancels whole job ──────────────────────────────────

const testTQ27PlatformAdminCancel = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
    });
    const orderUniqueId = (await getLatestOrders(1))[0].shipperRequestUniqueId;
    await cancelOrder({ orderUniqueId, cancelAs: "admin" });

    const o = await getOrderByUniqueId(orderUniqueId);
    if (o.journeyStatusId !== 10) {
      throw new Error(`order should be cancelledByAdmin(10), got ${o.journeyStatusId}`);
    }
    const canceled = await getCanceledJourneysForOrder(orderUniqueId);
    const adminCancel = canceled.find((c) => Number(c.roleId) === 3);
    if (!adminCancel) {
      throw new Error(`expected a CanceledJourneys row with roleId 3, got ${JSON.stringify(canceled)}`);
    }
    report.pass("TQ-27: platform admin cancels whole job (roleId 3 recorded)");
  } catch (error) {
    report.fail("TQ-27: platform admin whole-job cancel", error);
  }
};

// ── TQ-29 · Batch order dispatches one offer per slot ─────────────────────────

const testTQ29BatchOneOfferPerSlot = async () => {
  try {
    await createQueueOrder({
      queueOrganizationUniqueId: ORG(),
      vehicleTypeUniqueId: typeA(),
      numberOfVehicles: 2,
    });
    const batch = await getLatestOrders(2);
    if (batch.length !== 2) {
      throw new Error(`expected 2 batch orders, got ${batch.length}`);
    }

    const e2 = await entryOf("queueDriver2");
    const e3 = await entryOf("queueDriver3");
    if (!e2 || !e3 || e2.status !== "offered" || e3.status !== "offered") {
      throw new Error(`batch should offer d2+d3: ${JSON.stringify({ e2, e3 })}`);
    }
    const linked = new Set([e2.shipperRequestUniqueId, e3.shipperRequestUniqueId]);
    for (const row of batch) {
      if (!linked.has(row.shipperRequestUniqueId)) {
        throw new Error(`slot ${row.shipperRequestUniqueId} not linked to an offered entry`);
      }
      if ((await getJourneyDecisionCount(row.shipperRequestUniqueId)) !== 1) {
        throw new Error(`slot should have exactly 1 decision`);
      }
    }

    const a1 = await acceptOrder("queueDriver2", 6000);
    const a2 = await acceptOrder("queueDriver3", 6000);
    if (!a1 || !a2) {
      throw new Error("one of the batch accepts failed");
    }
    const after2 = await entryOf("queueDriver2");
    const after3 = await entryOf("queueDriver3");
    if (!after2 || !after3 || after2.status !== "loaded" || after3.status !== "loaded") {
      throw new Error("batch slots should both end loaded");
    }
    report.pass("TQ-29: batch (n=2) → one offer per slot, both accept → both loaded");
  } catch (error) {
    report.fail("TQ-29: batch dispatch", error);
  }
};

// ── TQ-30 · Concurrent dispatch never double-offers a driver ──────────────────

const testTQ30ConcurrentDispatch = async () => {
  try {
    const createOne = () =>
      createQueueOrder({ queueOrganizationUniqueId: ORG(), vehicleTypeUniqueId: typeB() });
    await Promise.all([createOne(), createOne()]);

    const batch = await getLatestOrders(2);
    const e4 = await entryOf("queueDriver4");
    if (!e4 || e4.status !== "offered") {
      throw new Error(`d4 should be offered after concurrent dispatch: ${JSON.stringify(e4)}`);
    }
    const winner = batch.find((r) => r.shipperRequestUniqueId === e4.shipperRequestUniqueId);
    const loser = batch.find((r) => r.shipperRequestUniqueId !== e4.shipperRequestUniqueId);
    if (!winner || !loser) {
      throw new Error("expected one winner + one loser among the two concurrent orders");
    }
    orders.O_W = winner.shipperRequestUniqueId;
    orders.O_L = loser.shipperRequestUniqueId;

    if ((await getJourneyDecisionCount(orders.O_L)) !== 0) {
      throw new Error("loser order must not be offered (no decision)");
    }
    const loserOrder = await getOrderByUniqueId(orders.O_L);
    if (loserOrder.journeyStatusId !== 1) {
      throw new Error(`loser should stay waiting(1), got ${loserOrder.journeyStatusId}`);
    }
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM JourneyDecisions jd
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       WHERE sr.shipperRequestUniqueId IN (?, ?)`,
      [orders.O_W, orders.O_L],
    );
    if (countRows[0].total !== 1) {
      throw new Error(`exactly one offer expected across the pair, got ${countRows[0].total}`);
    }
    report.pass("TQ-30: concurrent dispatch → exactly one offer, loser waits");
  } catch (error) {
    report.fail("TQ-30: concurrent dispatch", error);
  }
};

// ── TQ-31 · Concurrent accept from same driver/order ──────────────────────────

const testTQ31ConcurrentAccept = async () => {
  try {
    await getDriverJourneyStatus({ userType: "queueDriver4" });
    const ids = offerIds("queueDriver4");
    if (!ids.driverRequestUniqueId || !ids.journeyDecisionUniqueId) {
      throw new Error("d4 has no active offer for concurrent accept");
    }

    const [r1, r2] = await Promise.allSettled([
      rawAccept("queueDriver4", ids, 6000),
      rawAccept("queueDriver4", ids, 6000),
    ]);
    const ok = [r1, r2].filter(
      (r) => r.status === "fulfilled" && r.value.status === 200,
    ).length;
    if (ok < 1) {
      throw new Error("no concurrent accept succeeded");
    }

    const e4 = await entryOf("queueDriver4");
    if (!e4 || e4.status !== "loaded") {
      throw new Error(`d4 entry should be loaded exactly once: ${JSON.stringify(e4)}`);
    }
    const [decRows] = await pool.query(
      `SELECT jd.journeyStatusId FROM JourneyDecisions jd
       JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
       WHERE sr.shipperRequestUniqueId = ?`,
      [orders.O_W],
    );
    if (!decRows.every((r) => r.journeyStatusId === 3)) {
      throw new Error("decision should end acceptedByDriver(3) exactly once");
    }
    report.pass("TQ-31: concurrent accept → final state consistent (entry loaded once)");
  } catch (error) {
    report.fail("TQ-31: concurrent accept", error);
  }
};

// ── TQ-32 · Check-in races (same driver, parallel) ────────────────────────────

const testTQ32CheckinRace = async () => {
  try {
    await Promise.all([
      checkin("queueDriver4", ORG()),
      checkin("queueDriver4", ORG()),
      checkin("queueDriver4", ORG()),
    ]);
    const active = await getActiveQueueCountForDriver("queueDriver4");
    if (active !== 1) {
      throw new Error(`parallel check-in must yield exactly 1 active row, got ${active}`);
    }
    report.pass("TQ-32: parallel check-in race → exactly one active row");
  } catch (error) {
    report.fail("TQ-32: check-in race", error);
  }
};

// ── TQ-28 · Cancel order NOT linked to queue → no queue effect ────────────────

const testTQ28NonQueueCancelNoQueueEffect = async () => {
  try {
    const payload = buildQueueOrderPayload({ vehicleTypeUniqueId: typeA() });
    delete payload.queueOrganizationUniqueId;
    await axios.post(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.CREATE_REQUEST,
      payload,
      authConfig(shipperToken()),
    );
    const row = (await getLatestOrders(1))[0];
    const orderUniqueId = row.shipperRequestUniqueId;

    await cancelOrder({ orderUniqueId, cancelAs: "shipper" });

    const o = await getOrderByUniqueId(orderUniqueId);
    if (o.journeyStatusId !== 7) {
      throw new Error(`non-queue order should be cancelled(7), got ${o.journeyStatusId}`);
    }
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total FROM DriverQueue WHERE shipperRequestUniqueId = ?`,
      [orderUniqueId],
    );
    if (rows[0].total !== 0) {
      throw new Error("non-queue cancel must not touch DriverQueue");
    }
    report.pass("TQ-28: non-queue order cancel → no DriverQueue effect");
  } catch (error) {
    report.fail("TQ-28: non-queue cancel no queue effect", error);
  }
};

// ── Entry point ───────────────────────────────────────────────────────────────

const runQueueOrderTests = async () => {
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  ORDER LIFECYCLE — TQ-11..TQ-32");
  console.log("═══════════════════════════════════════════════════\n");

  await testTQ11AutoOfferFront();
  await testTQ15AcceptLeavesQueue();
  await testTQ16RepeatAcceptDenied();
  await testTQ17NonOfferedDriverDenied();
  await testTQ13SkipHoldingDriver();
  await testTQ12NoMatchingTypeStaysWaiting();
  await testTQ19ShipperPriceReject();
  await testTQ18DriverRejectAdvances();
  await testTQ21EmptyQueueStaysWaiting();
  await testTQ22RepeatedRejectNoop();
  await testTQ24BelowLimitStaysFront();
  await testTQ23RefusalLimitMovesToBack();
  await testTQ25ShipperCancelReleases();
  await testTQ26QueueAdminCancel();
  await testTQ27PlatformAdminCancel();
  await testTQ29BatchOneOfferPerSlot();
  await testTQ30ConcurrentDispatch();
  await testTQ31ConcurrentAccept();
  await testTQ32CheckinRace();
  await testTQ28NonQueueCancelNoQueueEffect();
};

module.exports = { runQueueOrderTests };
