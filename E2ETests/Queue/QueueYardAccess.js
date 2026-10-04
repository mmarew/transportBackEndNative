"use strict";

// Yard authority + two-number queue model (QYA-01..05)
//
// The loading yard's turn is decided by WHO HOLDS A JOB, not by the stored
// queueNumber. queueNumber stays the immutable arrival number; a derived
// linePosition (1..N counting only drivers STILL WAITING) renumbers the line
// automatically as drivers get jobs. Suites:
//   QYA-01  FIFO accept → job holder leaves the waiting line; waiting drivers
//           renumber down (d2 2→1, d3 3→2) and the board splits into lanes.
//   QYA-02  yardPass: PASS for the job holder (with order + plate), HOLD for
//           a waiting driver.
//   QYA-03  reserved-not-assigned entry: HOLD reserved_not_assigned,
//           reservation exposed, hasActiveJob false.
//   QYA-04  BID-BASE accept links the (previously unlinked) queue entry —
//           root-cause fix for "driver has a job but queue says WAITING".
//   QYA-05  shipper selects the winner → the losing bidder's AGREED entry is
//           released back to WAITING (position kept, linkage cleared).
//   QYA-06  loadingOrderNumber (yard entrance number) is issued WRITE-ONCE at
//           accept — ONE continuous sequence per org+day: the first shipper's
//           trucks take 1,2,3 and the next shipper's continue 4,5,6,7,
//           regardless of each truck's queueNumber.
//   QYA-07  TWO-LEVEL SHIPPER-TURN RULE: only the SERVING shipper's job
//           holders may enter the yard. Another shipper's AGREED truck HOLDs
//           (waiting_shipper_turn) even though it holds a job; the serving
//           shipper is the one whose truck carries the LOWEST number, and
//           their trucks enter in number order. Board (shipperTurn + gated
//           loadingNow lane), yardPass (servingShipper named) and myPosition
//           all agree.
//   QYA-08  LEGACY AGREED GHOST checkout: a status-3 entry with no order
//           linkage anywhere is stuck as a phantom job holder — checkout must
//           accept it (releases the fence), while a REAL job holder with a
//           linked order gets 409 (cancel/complete first). The order is
//           therefore cancelled BEFORE the ghost is forged: checkout resolves
//           a live order through resolveActiveOrderForDriver() even when
//           DriverQueue carries no linkage.

const axios = require("axios");
const {
  backendURL,
  usersData,
  journeyStatusMap,
} = require("../constants");
const { authConfig } = require("../Utils");
const { report } = require("../Reporter");
const { queueState } = require("./state");
const { pool } = require("../../Middleware/Database.config");
const {
  SHIPPER_REQUEST_ENDPOINTS,
} = require("../../Routes/EndPoints/shipperRequest.endpoints");
const {
  createQueueOrganization,
  approveQueueOrganization,
  deleteQueueOrganization,
  checkin,
  checkinWithShipper,
  checkout,
  resetDriverQueueDay,
  resetDriverJourneyDay,
  myPosition,
  getQueueStatus,
  createQueueOrder,
  createQueueOrderAsShipper2,
  ensureShipper2,
  getLatestOrders,
  getQueueEntryByDriver,
  acceptOrder,
  cancelOrder,
  driverToken,
  expectStatus,
} = require("./helpers");
const { getDriverJourneyStatus } = require("../Driver/DriverJourneyStatus");

const superAdminToken = () => usersData.supperAdmin?.token;
const shipperToken = () => usersData.shipper?.token;

/**
 * Fence sweep: check a driver out of ANY org (no queueOrganizationUniqueId →
 * the service's system-wide fence resolves their live entry). Best-effort —
 * makes this suite immune to live entries earlier suites left behind.
 */
const fenceSweep = async (driverKey) => {
  try {
    await axios.delete(
      backendURL + "/api/queue/driver/checkout",
      authConfig(driverToken(driverKey)),
    );
  } catch {
    // no live entry — fine
  }
};

/**
 * Board lanes are keyed by VEHICLE TYPE NAME and inserted in row order, so
 * `Object.values(lanes)[0]` is whichever driver checked in FIRST — not
 * necessarily the lane under test (Suite A checks d4 in as typeB before d1..d3
 * as typeA). Resolve the lane that actually holds an entry instead.
 */
const laneOf = (board, queueUniqueId) =>
  Object.values(board?.lanes || {}).find(
    (lane) =>
      lane.loadingNow.some((e) => e.queue.queueUniqueId === queueUniqueId) ||
      lane.waiting.some((e) => e.queue.queueUniqueId === queueUniqueId),
  );

const QYA = () => queueState.yardAccess;

// ── QYA-01 ────────────────────────────────────────────────────────────────────
// FIFO accept renumbers the waiting line and moves the job holder into the
// loadingNow lane.
const testQYA01FifoAcceptRenumbers = async ({ org, orderUniqueId }) => {
  // Pre-accept: d1 holds the offer (REQUESTED = still "waiting" for the yard),
  // so d2 sees 1 ahead and linePosition 2; d3 sees 2 ahead / linePosition 3.
  const d2Before = await myPosition("queueDriver2", org);
  if (d2Before?.queue?.waitingAhead !== 1 || d2Before?.queue?.linePosition !== 2) {
    throw new Error(
      `pre-accept d2 expected waitingAhead=1/linePosition=2, got ${JSON.stringify(
        d2Before?.queue,
      )}`,
    );
  }
  if (d2Before.queue.hasActiveJob !== false) {
    throw new Error("pre-accept d2 should not have an active job");
  }
  const d3Before = await myPosition("queueDriver3", org);
  if (d3Before?.queue?.linePosition !== 3) {
    throw new Error(
      `pre-accept d3 expected linePosition=3, got ${d3Before?.queue?.linePosition}`,
    );
  }

  await acceptOrder("queueDriver1");

  // Post-accept: d1 holds a JOB → out of the waiting line → the line renumbers.
  const d2After = await myPosition("queueDriver2", org);
  if (d2After?.queue?.waitingAhead !== 0 || d2After?.queue?.linePosition !== 1) {
    throw new Error(
      `post-accept d2 expected waitingAhead=0/linePosition=1, got ${JSON.stringify(
        d2After?.queue,
      )}`,
    );
  }
  const d3After = await myPosition("queueDriver3", org);
  if (d3After?.queue?.waitingAhead !== 1 || d3After?.queue?.linePosition !== 2) {
    throw new Error(
      `post-accept d3 expected waitingAhead=1/linePosition=2, got ${JSON.stringify(
        d3After?.queue,
      )}`,
    );
  }
  // queueNumber (arrival order) is immutable for the waiting drivers.
  if (d2After.queue.queueNumber !== d2Before.queue.queueNumber) {
    throw new Error("stored queueNumber must never change on renumbering");
  }

  // d1's entry is AGREED with the order linked (the FIFO offer self-linked).
  const d1Entry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver1",
  });
  if (!d1Entry || d1Entry.status !== journeyStatusMap.acceptedByDriver) {
    throw new Error(`d1 entry should be agreed(3), got ${d1Entry?.status}`);
  }
  if (d1Entry.shipperRequestUniqueId !== orderUniqueId) {
    throw new Error("d1 entry should carry the accepted order linkage");
  }

  // Board lanes: d1 in loadingNow, d2 (linePosition 1) + d3 in waiting.
  const board = await getQueueStatus(org);
  const typeA = laneOf(board, d1Entry.queueUniqueId);
  if (!typeA) {
    throw new Error(
      `board has no lane for d1's entry ${d1Entry.queueUniqueId}, got ${JSON.stringify(Object.keys(board.lanes || {}))}`,
    );
  }
  if (!typeA?.loadingNow?.length) {
    throw new Error("board lanes missing a loadingNow entry after accept");
  }
  const loadingNowIds = typeA.loadingNow.map((e) => e.queue.queueUniqueId);
  if (!loadingNowIds.includes(d1Entry.queueUniqueId)) {
    throw new Error("d1 entry should be in the loadingNow lane");
  }
  const waitingAfter = typeA.waiting.map((e) => ({
    qn: e.queue.queueNumber,
    lp: e.queue.linePosition,
  }));
  const d2Waiting = waitingAfter.find((w) => w.qn === d2After.queue.queueNumber);
  if (!d2Waiting || d2Waiting.lp !== 1) {
    throw new Error(`waiting lane should show d2 at linePosition 1, got ${JSON.stringify(waitingAfter)}`);
  }
  if (board.statistics.loadingNow < 1) {
    throw new Error("statistics.loadingNow should count the job holder");
  }
  report.pass("QYA-01: FIFO accept renumbers waiting line + loadingNow lane");
};

// ── QYA-02 ────────────────────────────────────────────────────────────────────
// Yard gate: PASS for the job holder, HOLD for waiting drivers.
const testQYA02YardPass = async ({ org, orderUniqueId }) => {
  const d1Entry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver1",
  });
  const pass = await axios.get(
    backendURL + `/api/queue/entry/${d1Entry.queueUniqueId}/yardPass`,
    authConfig(superAdminToken()),
  );
  if (pass.data?.data?.verdict !== "PASS") {
    throw new Error(`job holder yardPass should be PASS, got ${JSON.stringify(pass.data?.data)}`);
  }
  if (pass.data.data.order?.shipperRequestUniqueId !== orderUniqueId) {
    throw new Error("PASS payload should carry the accepted order");
  }
  if (!pass.data.data.vehicle?.licensePlate) {
    throw new Error("PASS payload should carry the license plate");
  }

  const d2Entry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver2",
  });
  const hold = await axios.get(
    backendURL + `/api/queue/entry/${d2Entry.queueUniqueId}/yardPass`,
    authConfig(superAdminToken()),
  );
  if (hold.data?.data?.verdict !== "HOLD") {
    throw new Error(`waiting driver yardPass should be HOLD, got ${JSON.stringify(hold.data?.data)}`);
  }
  if (hold.data.data.reason !== "waiting_for_job_offer") {
    throw new Error(
      `waiting driver HOLD reason expected waiting_for_job_offer, got ${hold.data.data.reason}`,
    );
  }
  report.pass("QYA-02: yardPass PASS for job holder / HOLD for waiting driver");
};

// ── QYA-03 ────────────────────────────────────────────────────────────────────
// Reserved-not-assigned: the shipper reservation is NOT a job.
const testQYA03ReservationHold = async ({ org }) => {
  const d4 = await myPosition("queueDriver4", org);
  const q = d4?.queue;
  if (!q) throw new Error("d4 should have a live entry in the org");
  if (q.hasActiveJob !== false) {
    throw new Error("reserved-not-assigned driver must have hasActiveJob=false");
  }
  if (q.yardAccess?.verdict !== "HOLD" || q.yardAccess.reason !== "reserved_not_assigned") {
    throw new Error(
      `reserved entry should HOLD reserved_not_assigned, got ${JSON.stringify(q.yardAccess)}`,
    );
  }
  if (!q.targetedShipperUserUUID) {
    throw new Error("reservation should be visible on the entry");
  }
  // The driver-status poll carries the same truth (Fix C).
  const status = await getDriverJourneyStatus({ userType: "queueDriver4" });
  const ctx = status?.driverQueue;
  if (!ctx || ctx.hasActiveJob !== false || ctx.yardAccess?.verdict !== "HOLD") {
    throw new Error(
      `verifyDriverJourneyStatus driverQueue should HOLD for reserved driver, got ${JSON.stringify(ctx)}`,
    );
  }
  if (!ctx.reservation) {
    throw new Error("verifyDriverJourneyStatus driverQueue should expose the reservation");
  }
  report.pass("QYA-03: reservation shows HOLD reserved_not_assigned (not a job)");
};

// ── QYA-04 ────────────────────────────────────────────────────────────────────
// ROOT-CAUSE FIX: a bid-board accept links the previously unlinked entry.
const testQYA04BidAcceptLinksEntry = async ({ org, orderUniqueId }) => {
  // Pre-accept: the bare bid-board decision left the entry WAITING/unlinked —
  // the exact state from the incident report (status 1, no linkage).
  const d2EntryPre = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver2",
  });
  if (!d2EntryPre || d2EntryPre.status !== journeyStatusMap.waiting) {
    throw new Error(
      `pre-accept d2 entry should still be waiting(1), got ${d2EntryPre?.status}`,
    );
  }
  if (d2EntryPre.shipperRequestUniqueId !== null) {
    throw new Error("pre-accept d2 entry should be UNLINKED (bare decision path)");
  }

  await getDriverJourneyStatus({ userType: "queueDriver2" });
  await acceptOrder("queueDriver2");

  // Post-accept: entry flips to AGREED WITH linkage.
  const d2Entry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver2",
  });
  if (!d2Entry || d2Entry.status !== journeyStatusMap.acceptedByDriver) {
    throw new Error(
      `post-accept d2 entry should be agreed(3), got ${d2Entry?.status}`,
    );
  }
  if (d2Entry.shipperRequestUniqueId !== orderUniqueId) {
    throw new Error(
      `post-accept d2 entry should carry the order linkage, got ${d2Entry?.shipperRequestUniqueId}`,
    );
  }

  // myPosition reports the job + yard PASS.
  const pos = await myPosition("queueDriver2", org);
  if (pos?.queue?.hasActiveJob !== true || pos?.queue?.yardAccess?.verdict !== "PASS") {
    throw new Error(
      `d2 myPosition should show hasActiveJob/PASS, got ${JSON.stringify(pos?.queue)}`,
    );
  }
  if (pos.queue.activeOrder?.shipperRequestUniqueId !== orderUniqueId) {
    throw new Error("myPosition activeOrder should carry the accepted order");
  }
  if (pos.queue.linePosition !== null) {
    throw new Error("job holder should have no waiting-line position");
  }

  // verifyDriverJourneyStatus agrees (Fix C).
  const status = await getDriverJourneyStatus({ userType: "queueDriver2" });
  if (status?.driverQueue?.hasActiveJob !== true || status?.driverQueue?.yardAccess?.verdict !== "PASS") {
    throw new Error(
      `verifyDriverJourneyStatus driverQueue should PASS for d2, got ${JSON.stringify(status?.driverQueue)}`,
    );
  }
  report.pass("QYA-04: bid-base accept links the queue entry (has job = yard PASS)");
};

// ── QYA-05 ────────────────────────────────────────────────────────────────────
// Shipper selects the winner → the losing bidder's AGREED entry is released.
const testQYA05LoserRelease = async ({ org, orderUniqueId }) => {
  // d3 must not be a holder: linkQueueEntryOnAccept() Guard 3 allows only ONE
  // live entry per order, and the shipper-select 409s once the loser has
  // accepted ("Driver is already on an active job"). So the loser keeps only
  // an outstanding offer on the bid board.
  const d3Pre = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver3",
  });
  if (!d3Pre) {
    throw new Error("pre-select d3 must hold a live entry in the org");
  }
  if (d3Pre.shipperRequestUniqueId !== null) {
    throw new Error(
      `pre-select d3 entry must be UNLINKED — only one holder per order, got ${d3Pre.shipperRequestUniqueId}`,
    );
  }
  const d3PreStatus = d3Pre.status;
  if (
    d3PreStatus !== journeyStatusMap.waiting &&
    d3PreStatus !== journeyStatusMap.requested
  ) {
    throw new Error(
      `pre-select d3 should hold only an outstanding offer (waiting/requested), got ${d3PreStatus}`,
    );
  }

  // Shipper picks d2 as the winner (loser decisions → notSelectedInBid).
  // Refresh the winner ids for THIS order — the cached ones belong to the
  // order QYA-04 already consumed.
  await getDriverJourneyStatus({ userType: "queueDriver2" });
  const winnerIds = usersData.queueDriver2?.journeyStatus?.uniqueIds;
  if (!winnerIds?.driverRequestUniqueId || !winnerIds?.journeyDecisionUniqueId) {
    throw new Error("missing winner uniqueIds — call getDriverJourneyStatus first");
  }
  await axios
    .put(
      backendURL + SHIPPER_REQUEST_ENDPOINTS.ACCEPT_DRIVER_OFFER,
      {
        driverRequestUniqueId: winnerIds.driverRequestUniqueId,
        journeyDecisionUniqueId: winnerIds.journeyDecisionUniqueId,
        shipperRequestUniqueId: orderUniqueId,
      },
      authConfig(shipperToken()),
    )
    .catch((error) => {
      // Surface the server's reason — a bare 409 here hides whether the order
      // was already accepted, already assigned, or the decision was stale.
      throw new Error(
        `shipper select failed: HTTP ${error.response?.status} ${JSON.stringify(error.response?.data)}`,
      );
    });

  // Winner keeps the job; the loser is back to WAITING with linkage cleared.
  const d2Entry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver2",
  });
  if (!d2Entry || d2Entry.shipperRequestUniqueId !== orderUniqueId) {
    throw new Error("winner d2 entry should keep the order linkage");
  }
  const d3Post = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver3",
  });
  if (!d3Post || d3Post.status !== journeyStatusMap.waiting) {
    throw new Error(`loser d3 entry should be released to waiting(1), got ${d3Post?.status}`);
  }
  if (d3Post.shipperRequestUniqueId !== null) {
    throw new Error("loser d3 entry linkage should be cleared");
  }
  if (d3Post.queueNumber !== d3Pre.queueNumber) {
    throw new Error("loser keeps their arrival queueNumber (position preserved)");
  }
  if (d3Post.loadingOrderNumber !== null) {
    throw new Error(
      `loser release must clear the yard-entrance number, got ${d3Post.loadingOrderNumber}`,
    );
  }
  const d3Pos = await myPosition("queueDriver3", org);
  if (d3Pos?.queue?.linePosition !== 1 || d3Pos?.queue?.hasActiveJob !== false) {
    throw new Error(
      `loser d3 should be waiting at linePosition 1, got ${JSON.stringify(d3Pos?.queue)}`,
    );
  }
  report.pass("QYA-05: shipper-select releases the losing bidder's entry to WAITING");
};

// ── QYA-06 ────────────────────────────────────────────────────────────────────
// Yard-entrance number (loadingOrderNumber) is issued WRITE-ONCE at accept —
// ONE continuous sequence per org+day — never recomputed or filtered on read.
const testQYA06LoadingOrderNumbers = async ({ org, orderUniqueId }) => {
  const d1Entry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver1",
  });
  if (!d1Entry || d1Entry.loadingOrderNumber !== 1) {
    throw new Error(
      `d1 yard-entrance number should be 1, got ${d1Entry?.loadingOrderNumber}`,
    );
  }
  if (d1Entry.shipperRequestUniqueId !== orderUniqueId) {
    throw new Error("numbered entry must be the one holding the accepted order");
  }
  // Waiting/reserved entries carry NO number — it exists only once a job is held.
  for (const driverKey of ["queueDriver2", "queueDriver3", "queueDriver4"]) {
    const entry = await getQueueEntryByDriver({
      queueOrganizationUniqueId: org,
      driverKey,
    });
    if (entry?.loadingOrderNumber !== null) {
      throw new Error(
        `${driverKey} (no job) must have loadingOrderNumber null, got ${entry?.loadingOrderNumber}`,
      );
    }
  }
  // The driver-facing read surfaces the persisted column (no recomputation).
  const pos = await myPosition("queueDriver1", org);
  if (pos?.queue?.loadingOrderNumber !== 1) {
    throw new Error(
      `myPosition should surface loadingOrderNumber 1, got ${pos?.queue?.loadingOrderNumber}`,
    );
  }
  report.pass("QYA-06: loadingOrderNumber issued once at accept (continuous per org+day)");
};

// ── QYA-07 ────────────────────────────────────────────────────────────────────
// TWO-LEVEL SHIPPER-TURN RULE. org3: d1 holds shipper1's order (number 1 =
// serving), d2+d3 hold shipper2's orders (they continue the day's sequence:
// 2 and 3). Shipper2's trucks HOLD at the entrance (waiting_shipper_turn)
// although they hold jobs; shipper1's truck PASSes; the board names the
// serving shipper.
const testQYA07ShipperTurnGate = async ({ org }) => {
  const entries = {};
  for (const driverKey of ["queueDriver1", "queueDriver2", "queueDriver3"]) {
    entries[driverKey] = await getQueueEntryByDriver({
      queueOrganizationUniqueId: org,
      driverKey,
    });
  }
  const [d1, d2, d3] = [
    entries.queueDriver1,
    entries.queueDriver2,
    entries.queueDriver3,
  ];

  // Level 2 — ONE continuous sequence per org+day: accepts stamped 1,2,3 in
  // order regardless of the drivers' queueNumbers.
  if (d1.loadingOrderNumber !== 1) {
    throw new Error(`serving shipper's truck should be number 1, got ${d1.loadingOrderNumber}`);
  }
  if (d2.loadingOrderNumber !== 2 || d3.loadingOrderNumber !== 3) {
    throw new Error(
      `the next accepts should continue 2 and 3, got ${d2.loadingOrderNumber}/${d3.loadingOrderNumber}`,
    );
  }

  // Gate API: serving shipper's truck PASSes; the other shipper's HOLD.
  const pass = await axios.get(
    backendURL + `/api/queue/entry/${d1.queueUniqueId}/yardPass`,
    authConfig(superAdminToken()),
  );
  if (pass.data?.data?.verdict !== "PASS") {
    throw new Error(`serving shipper's truck should PASS, got ${JSON.stringify(pass.data?.data)}`);
  }
  if (pass.data.data.servingShipper?.userUniqueId !== queueState.shipper.userUniqueId) {
    throw new Error("PASS payload should name the serving shipper");
  }
  for (const [entry, expectedNumber] of [[d2, 2], [d3, 3]]) {
    const hold = await axios.get(
      backendURL + `/api/queue/entry/${entry.queueUniqueId}/yardPass`,
      authConfig(superAdminToken()),
    );
    const body = hold.data?.data;
    if (body?.verdict !== "HOLD" || body?.reason !== "waiting_shipper_turn") {
      throw new Error(
        `other shipper's truck should HOLD waiting_shipper_turn, got ${JSON.stringify(body)}`,
      );
    }
    if (body.queue?.loadingOrderNumber !== expectedNumber) {
      throw new Error(
        `HOLD payload should carry the yard-entrance number ${expectedNumber}, got ${body.queue?.loadingOrderNumber}`,
      );
    }
    if (body.servingShipper?.userUniqueId !== queueState.shipper.userUniqueId) {
      throw new Error("HOLD payload should name WHO is being served instead");
    }
    if (body.order?.shipperRequestUniqueId !== entry.shipperRequestUniqueId) {
      throw new Error("HOLD payload should still identify the held order");
    }
  }

  // Driver poll agrees (myPosition gate).
  const pos1 = await myPosition("queueDriver1", org);
  if (pos1?.queue?.yardAccess?.verdict !== "PASS") {
    throw new Error(`serving shipper's driver should see PASS, got ${JSON.stringify(pos1?.queue?.yardAccess)}`);
  }
  const pos2 = await myPosition("queueDriver2", org);
  if (
    pos2?.queue?.hasActiveJob !== true ||
    pos2?.queue?.yardAccess?.verdict !== "HOLD" ||
    pos2?.queue?.yardAccess?.reason !== "waiting_shipper_turn"
  ) {
    throw new Error(
      `other shipper's driver should see HOLD waiting_shipper_turn, got ${JSON.stringify(pos2?.queue?.yardAccess)}`,
    );
  }

  // Board: serving shipper named, loadingNow lane gated, loading line ordered
  // by the persisted numbers (d1 first — number 1 of the serving shipper;
  // d2's 2 next; d3's 3 last).
  const board = await getQueueStatus(org);
  if (board.shipperTurn?.servingShipperUserUniqueId !== queueState.shipper.userUniqueId) {
    throw new Error(
      `board should name the serving shipper, got ${JSON.stringify(board.shipperTurn)}`,
    );
  }
  const typeA = laneOf(board, d1.queueUniqueId);
  if (!typeA) {
    throw new Error(
      `board has no lane for d1's entry ${d1.queueUniqueId}, got ${JSON.stringify(Object.keys(board.lanes || {}))}`,
    );
  }
  if (typeA?.loadingNow?.length !== 3) {
    throw new Error(
      `loadingNow lane should hold all three job holders, got ${typeA?.loadingNow?.length}`,
    );
  }
  const loadingIds = typeA.loadingNow.map((e) => e.queue.queueUniqueId);
  if (loadingIds[0] !== d1.queueUniqueId || loadingIds[2] !== d3.queueUniqueId) {
    throw new Error(
      `loading line should run d1(1) → d2(2) → d3(3), got ${JSON.stringify(loadingIds)}`,
    );
  }
  for (const entry of typeA.loadingNow) {
    const isServingShipperTruck = entry.queue.queueUniqueId === d1.queueUniqueId;
    if (isServingShipperTruck && entry.queue.yardAccess?.verdict !== "PASS") {
      throw new Error(`board should keep the serving shipper's truck PASS, got ${JSON.stringify(entry.queue.yardAccess)}`);
    }
    if (!isServingShipperTruck &&
      (entry.queue.yardAccess?.verdict !== "HOLD" ||
        entry.queue.yardAccess?.reason !== "waiting_shipper_turn")) {
      throw new Error(
        `board should gate the other shipper's trucks, got ${JSON.stringify(entry.queue.yardAccess)}`,
      );
    }
  }
  report.pass("QYA-07: shipper-turn gate — only the serving shipper's trucks enter (continuous 1,2,3)");
};

// ── QYA-08 ────────────────────────────────────────────────────────────────────
// Legacy AGREED GHOST (status 3, no linkage anywhere): checkout must release
// it instead of 404ing "Driver is not in the queue for today"; a REAL job
// holder must still be refused with 409.
const testQYA08GhostCheckout = async ({ org, orderUniqueId }) => {
  // A REAL job holder (d1, linked order) cannot checkout their job away.
  const linkedEntry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver1",
  });
  if (!linkedEntry || linkedEntry.shipperRequestUniqueId === null || linkedEntry.shipperRequestUniqueId === undefined) {
    throw new Error("pre: d1 must hold a LINKED order for this test");
  }
  const refused = await expectStatus(
    axios.delete(backendURL + "/api/queue/driver/checkout", authConfig(driverToken("queueDriver1"))),
    [409],
    "checkout with active linked job",
  );
  if (!String(refused.data?.message || "").includes("active job")) {
    throw new Error(`real job holder checkout should 409 with a job message, got ${JSON.stringify(refused.data)}`);
  }

  // End the real job BEFORE forging the ghost. checkout resolves the active
  // order via resolveActiveOrderForDriver() when DriverQueue has no linkage, so
  // a still-open order would keep answering 409 and the ghost could never be
  // reached. Cancelling first also lets us re-assert the ghost shape below,
  // because the cancel may itself release d1's AGREED entry.
  await cancelOrder({ orderUniqueId, cancelAs: "shipper" });

  // Forge the legacy ghost: status stays 3, but no linkage anywhere.
  // This is the pre-fix incident state. The cancel above released (soft
  // deleted) d1's entry, so clear queueDeletedAt too — otherwise there is no
  // LIVE entry left for checkout to find and it 404s instead of releasing.
  await pool.query(
    `UPDATE DriverQueue SET status = ?, shipperRequestUniqueId = NULL, agreedAt = NULL,
       loadingOrderNumber = NULL, queueDeletedAt = NULL, queueDeletedBy = NULL
     WHERE queueId = ?`,
    [journeyStatusMap.acceptedByDriver, linkedEntry.queueId],
  );
  const ghostEntry = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver1",
  });
  if (!ghostEntry || ghostEntry.status !== journeyStatusMap.acceptedByDriver || ghostEntry.shipperRequestUniqueId !== null) {
    throw new Error(`ghost forge failed: ${JSON.stringify(ghostEntry)}`);
  }
  // myPosition still shows them as a phantom job holder (read-side heal
  // finds nothing — the order is cancelled below, so activeOrder is empty).
  const ghostPos = await myPosition("queueDriver1", org);
  if (ghostPos?.queue?.hasActiveJob !== true) {
    throw new Error("ghost should still surface as a job holder before checkout");
  }

  // THE FIX: checkout succeeds for the ghost (previously 404 not-in-queue).
  await axios.delete(backendURL + "/api/queue/driver/checkout", authConfig(driverToken("queueDriver1")));
  const after = await getQueueEntryByDriver({
    queueOrganizationUniqueId: org,
    driverKey: "queueDriver1",
  });
  if (after !== null) {
    throw new Error("ghost entry should be soft-deleted after checkout");
  }
  const freedPos = await myPosition("queueDriver1", org);
  if (freedPos?.queue) {
    throw new Error("driver should have no live position after ghost checkout");
  }
  report.pass("QYA-08: legacy AGREED-ghost checkout releases the fence (real job holder still 409)");
};

// ── Runner ────────────────────────────────────────────────────────────────────

const runQueueYardAccessTests = async () => {
  console.log("───── Yard authority + two-number queue (QYA) ─────");
  try {
    // ORDER: clear each driver's queue AND journey day BEFORE creating the orgs
    // below. Both fences are system-wide, so state left by an earlier suite
    // breaks these check-ins in two different silent ways:
    //   1. a live DriverQueue row elsewhere -> check-in 409s on the one-queue
    //      fence (or returns the OLD org's position as if it succeeded);
    //   2. an in-flight journey (status 2-8) -> check-in answers 200
    //      { alreadyInJourney: true } with NO queue row at all.
    // Neither is fixable by a checkout sweep (it 409s on an active job), and
    // both surfaced downstream as "d4 should have a live entry" in QYA-03/06.
    for (const driverKey of [
      "queueDriver1",
      "queueDriver2",
      "queueDriver3",
      "queueDriver4",
    ]) {
      await resetDriverQueueDay(driverKey);
      await resetDriverJourneyDay(driverKey);
    }

    // ── Suite A: FIFO renumber + yardPass (throwaway org #1) ──
    const org1 = await createQueueOrganization(
      `QYA-org1-${Date.now()}`,
      superAdminToken(),
    );
    const org1Id = org1.queueOrganizationUniqueId || org1?.data?.queueOrganizationUniqueId;
    QYA().org1Id = org1Id;
    await approveQueueOrganization({
      queueOrganizationUniqueId: org1Id,
      approvalStatus: "approved",
      queueEnabled: true,
      token: superAdminToken(),
    });
    // d4 joins RESERVED for the test shipper (reservation lane, typeB).
    const d4Checkin = await checkinWithShipper(
      "queueDriver4",
      org1Id,
      usersData.shipper?.phoneNumber,
    );
    // Fail HERE, at the cause, rather than 40 lines later inside QYA-03/06 with
    // a misleading "no live entry". check-in answers 200 for two non-joining
    // cases (same-org idempotent re-check-in, and `alreadyInJourney` for a
    // driver mid-journey), so a 2xx alone proves nothing.
    const d4Entry = await getQueueEntryByDriver({
      queueOrganizationUniqueId: org1Id,
      driverKey: "queueDriver4",
    });
    if (!d4Entry) {
      throw new Error(
        `d4 reservation check-in did not create an entry in org1 — ` +
          `response: ${JSON.stringify(d4Checkin)}`,
      );
    }
    // d1/d2/d3 join general (typeA).
    await checkin("queueDriver1", org1Id);
    await checkin("queueDriver2", org1Id);
    await checkin("queueDriver3", org1Id);

    // Normal FIFO order → offered to the front waiting driver (d1).
    await createQueueOrder({
      queueOrganizationUniqueId: org1Id,
      vehicleTypeUniqueId: queueState.drivers.queueDriver1.vehicleTypeUniqueId,
    });
    const [latest1] = await getLatestOrders(1);
    const order1 = latest1.shipperRequestUniqueId;

    try {
      await testQYA01FifoAcceptRenumbers({ org: org1Id, orderUniqueId: order1 });
    } catch (error) {
      report.fail("QYA-01: FIFO accept renumbers waiting line", error);
    }
    try {
      await testQYA02YardPass({ org: org1Id, orderUniqueId: order1 });
    } catch (error) {
      report.fail("QYA-02: yardPass verdicts", error);
    }
    try {
      await testQYA03ReservationHold({ org: org1Id });
    } catch (error) {
      report.fail("QYA-03: reservation HOLD", error);
    }
    try {
      await testQYA06LoadingOrderNumbers({ org: org1Id, orderUniqueId: order1 });
    } catch (error) {
      report.fail("QYA-06: loadingOrderNumber issuance", error);
    }

    // Free d1 (AGREED on order1) so Suite C can re-queue them in org3.
    try {
      await cancelOrder({ orderUniqueId: order1, cancelAs: "admin" });
    } catch (error) {
      console.log(`  ⚠ QYA early cancel order1 skipped: ${error?.message}`);
    }

    // ── Suite B: bid-base linkage (throwaway org #2) ──
    // Free d2/d3 from org1 (they are WAITING, no offer held) so the
    // one-queue-per-day fence lets them join org2.
    for (const driverKey of ["queueDriver2", "queueDriver3"]) {
      try {
        await checkout(driverKey, org1Id);
      } catch (error) {
        console.log(`  ⚠ QYA checkout ${driverKey} skipped: ${error?.message}`);
      }
    }

    const org2 = await createQueueOrganization(
      `QYA-org2-${Date.now()}`,
      superAdminToken(),
    );
    const org2Id = org2.queueOrganizationUniqueId || org2?.data?.queueOrganizationUniqueId;
    QYA().org2Id = org2Id;
    await approveQueueOrganization({
      queueOrganizationUniqueId: org2Id,
      approvalStatus: "approved",
      queueEnabled: true,
      token: superAdminToken(),
    });
    await checkin("queueDriver2", org2Id);
    await checkin("queueDriver3", org2Id);

    // Bid-base order NEAR the drivers (same coords as check-in) → the
    // creation-time bid board arms + invites BOTH queued drivers with bare
    // decisions (no queue linkage) — the incident's exact path.
    await createQueueOrder({
      queueOrganizationUniqueId: org2Id,
      vehicleTypeUniqueId: queueState.drivers.queueDriver2.vehicleTypeUniqueId,
      isBiddingApproved: true,
      origin: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa (near)" },
    });
    const [latest2] = await getLatestOrders(1);
    const order2 = latest2.shipperRequestUniqueId;

    try {
      await testQYA04BidAcceptLinksEntry({ org: org2Id, orderUniqueId: order2 });
    } catch (error) {
      report.fail("QYA-04: bid-base accept linkage", error);
    }

    // ORDER MATTERS: QYA-04's accept leaves d2 ON AN ACTIVE JOB, and
    // acceptDriverOffer() 409s a driver who already holds one
    // ("Driver is already on an active job and cannot take this one"). An order
    // is therefore EITHER accepted by a driver OR selected by the shipper —
    // never both. End order2 and free d2/d3 before running the select.
    try {
      await cancelOrder({ orderUniqueId: order2, cancelAs: "shipper" });
    } catch (error) {
      console.log(`  ⚠ QYA early cancel order2 skipped: ${error?.message}`);
    }
    for (const driverKey of ["queueDriver2", "queueDriver3"]) {
      try {
        await checkout(driverKey, org2Id);
      } catch (error) {
        // 404 just means the cancel above already released their entry, so
        // there is nothing left to clear — only report real failures.
        if (error?.response?.status !== 404) {
          console.log(
            `  ⚠ QYA re-checkin-prep ${driverKey} skipped: ${error?.message}`,
          );
        }
      }
    }
    await checkin("queueDriver2", org2Id);
    await checkin("queueDriver3", org2Id);

    // QYA-05 gets its OWN bid-board order so the shipper-select has a winner
    // who is not already carrying a job.
    await createQueueOrder({
      queueOrganizationUniqueId: org2Id,
      vehicleTypeUniqueId: queueState.drivers.queueDriver2.vehicleTypeUniqueId,
      isBiddingApproved: true,
      origin: { latitude: 9.03, longitude: 38.74, description: "Addis Ababa (near)" },
    });
    const [latest2b] = await getLatestOrders(1);
    const order2b = latest2b.shipperRequestUniqueId;
    try {
      await testQYA05LoserRelease({ org: org2Id, orderUniqueId: order2b });
    } catch (error) {
      report.fail("QYA-05: loser release on shipper select", error);
    }

    // Free d2/d3 for Suite C.
    try {
      await cancelOrder({ orderUniqueId: order2b, cancelAs: "shipper" });
    } catch (error) {
      console.log(`  ⚠ QYA early cancel order2b skipped: ${error?.message}`);
    }
    for (const driverKey of ["queueDriver1", "queueDriver2", "queueDriver3"]) {
      await fenceSweep(driverKey);
    }

    // ── Suite C: shipper-turn yard rule (throwaway org #3) ──
    await ensureShipper2();
    const org3 = await createQueueOrganization(
      `QYA-org3-${Date.now()}`,
      superAdminToken(),
    );
    const org3Id = org3.queueOrganizationUniqueId || org3?.data?.queueOrganizationUniqueId;
    QYA().org3Id = org3Id;
    await approveQueueOrganization({
      queueOrganizationUniqueId: org3Id,
      approvalStatus: "approved",
      queueEnabled: true,
      token: superAdminToken(),
    });
    await checkin("queueDriver1", org3Id);
    await checkin("queueDriver2", org3Id);
    await checkin("queueDriver3", org3Id);

    // Shipper1's order → FIFO front (d1). d1 accepts → shipper1 is SERVING
    // (their truck carries the lowest yard-entrance number).
    await createQueueOrder({
      queueOrganizationUniqueId: org3Id,
      vehicleTypeUniqueId: queueState.drivers.queueDriver1.vehicleTypeUniqueId,
    });
    const [latest3] = await getLatestOrders(1);
    const order3 = latest3.shipperRequestUniqueId;
    await acceptOrder("queueDriver1");

    // Shipper2's two orders → the next waiting drivers (d2, then d3). Both
    // accept — they HOLD JOBS (numbers 2 and 3 of the day's sequence) but are
    // NOT the serving shipper.
    await createQueueOrderAsShipper2({
      queueOrganizationUniqueId: org3Id,
      vehicleTypeUniqueId: queueState.drivers.queueDriver2.vehicleTypeUniqueId,
    });
    await acceptOrder("queueDriver2");
    await createQueueOrderAsShipper2({
      queueOrganizationUniqueId: org3Id,
      vehicleTypeUniqueId: queueState.drivers.queueDriver3.vehicleTypeUniqueId,
    });
    await acceptOrder("queueDriver3");
    const [latestShipper2] = await getLatestOrders(2, "shipper2");

    try {
      await testQYA07ShipperTurnGate({ org: org3Id });
    } catch (error) {
      report.fail("QYA-07: shipper-turn gate", error);
    }
    try {
      await testQYA08GhostCheckout({ org: org3Id, orderUniqueId: order3 });
    } catch (error) {
      report.fail("QYA-08: ghost checkout", error);
    }

    // Cleanup orders created in Suite C (best-effort).
    for (const [orderUniqueId, cancelAs] of [
      [latestShipper2?.[0]?.shipperRequestUniqueId, "shipper2"],
      [latestShipper2?.[1]?.shipperRequestUniqueId, "shipper2"],
      [order3, "shipper"],
    ]) {
      if (!orderUniqueId) continue;
      try {
        await cancelOrder({ orderUniqueId, cancelAs });
      } catch (error) {
        console.log(`  ⚠ QYA cleanup cancel ${orderUniqueId} skipped: ${error?.message}`);
      }
    }

    // ── Cleanup ──
    // Orders were cancelled per-suite above to free drivers between suites;
    // nothing left to cancel here.
  } catch (error) {
    report.fail("QYA setup: yard authority suite", error);
  } finally {
    // Free every driver used by this suite BEFORE deleting the orgs — a live
    // entry in a deleted org would trip the one-queue-per-day fence for every
    // later suite. Cancelled orders release AGREED entries; checkout clears
    // any remaining WAITING entries. All best-effort.
    for (const driverKey of [
      "queueDriver1",
      "queueDriver2",
      "queueDriver3",
      "queueDriver4",
    ]) {
      for (const orgKey of ["org1Id", "org2Id", "org3Id"]) {
        const org = QYA()[orgKey];
        if (!org) continue;
        try {
          await checkout(driverKey, org);
        } catch {
          // no live entry for this driver in this org — fine
        }
      }
    }
    for (const orgKey of ["org1Id", "org2Id", "org3Id"]) {
      const org = QYA()[orgKey];
      if (org) {
        try {
          await deleteQueueOrganization(org);
          console.log(`  ✅ QYA ${orgKey} cleaned up`);
        } catch (error) {
          console.log(`  ⚠ QYA cleanup (${orgKey}) skipped: ${error?.message}`);
        }
        QYA()[orgKey] = null;
      }
    }
  }
  return report.summary();
};

module.exports = { runQueueYardAccessTests };

if (require.main === module) {
  (async () => {
    try {
      const { ensureCoreUsers, ensureQueueDrivers } = require("../Auth/bootstrap");
      const { registerQueueDrivers, ensureShipper } = require("./helpers");
      const { getVehicleTypes } = require("./helpers");
      await ensureCoreUsers({ fetchAccount: false });
      await ensureQueueDrivers({ count: 4 });
      await registerQueueDrivers();
      await ensureShipper();
      const types = await getVehicleTypes();
      queueState.vehicleTypes.typeA = types[0].vehicleTypeUniqueId;
      queueState.vehicleTypes.typeB = types[1].vehicleTypeUniqueId;
      await runQueueYardAccessTests();
      process.exit(report.summary() ? 0 : 1);
    } catch (error) {
      console.error("FATAL:", error?.message || error);
      process.exit(1);
    }
  })();
}
