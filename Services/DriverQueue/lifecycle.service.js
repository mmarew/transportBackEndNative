"use strict";

const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const {
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
} = require("../../Utils/QueueSocket");
const {
  today,
  QUEUE_STATUS,
  HISTORY_EVENT,
  LIVE_ENTRY_STATUSES,
  JOB_STATUSES,
  logQueueHistory,
  nextLoadingNumber,
  resolveLatestActiveVehicleDriverForUser,
} = require("./helpers");
const { offerToNextDriver, applyRefusalPolicy } = require("./release.service");
const { notifyShipperOfQueueEvent } = require("./dispatch-notify");

/**
 * Any rejection of a queue order's offer — driver-side or shipper-side (shipper
 * rejects the driver's quoted price) — marks the entry `cancelled_before_accept`
 * (rejectedByDriver id, keeps position, stays in line, remains eligible for the
 * next order), advances the ORDER to the next driver of the same vehicle type,
 * and counts one penalty point toward the driver's refusal limit
 * (applyRefusalPolicy). Pass `driverUserUniqueId` to restrict to a specific
 * driver (driver-side reject); omit it to clear whichever entry holds the order
 * (shipper-side price rejection).
 */
exports.rejectOffer = async (data) => {
  const { shipperRequestUniqueId, user, driverUserUniqueId } = data;
  const executor = db();

  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.queueRefusalCount, dq.vehicleDriverUniqueId, vd.driverUserUniqueId, v.vehicleTypeUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status = ${QUEUE_STATUS.REQUESTED}
       AND dq.queueDeletedAt IS NULL
       ${driverUserUniqueId ? "AND vd.driverUserUniqueId = ?" : ""}
     ORDER BY dq.queueNumber ASC LIMIT 1
     FOR UPDATE`,
    driverUserUniqueId
      ? [shipperRequestUniqueId, driverUserUniqueId]
      : [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { message: "success", offered: false, data: null };
  }

  const entry = rows[0];
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.OFFER_REJECTED,
    performedBy: user.userUniqueId,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT,
      requestedAt: null,
      shipperRequestUniqueId: null,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
    },
    conditions: { queueId: entry.queueId },
  });

  await applyRefusalPolicy({ executor, entry, user });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    messageType: "queue_order_rejected",
  });

  const next = await offerToNextDriver({
    executor,
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
    vehicleTypeUniqueId: entry.vehicleTypeUniqueId,
    excludeVehicleDriverUniqueId: entry.vehicleDriverUniqueId,
    shipperRequestUniqueId,
    user,
  });

  if (next.offered === false) {
    // No further waiting driver of this vehicle type: tell the shipper their
    // order is not reserved anymore (the org admins already got
    // "queue_order_rejected" above).
    await notifyShipperOfQueueEvent({
      executor,
      shipperRequestUniqueId,
      messageType: "queue_order_rejected",
      message:
        "The driver rejected your order and no other driver is available at the moment.",
    });
  }

  return { message: "success", ...next };
};
/**
 * Close a queue slot once the driver COMPLETED its queue order's journey.
 * The entry is marked `journeyCompleted` (same closure as checkout/leave) so
 * the driver is out of the queue and MUST re-register for the next placement
 * (re-checkin revives the entry with a fresh queue number at the back of the
 * line). Idempotent: no-op unless the entry is still `agreed` and holding the
 * completed order. Called from completeJourney after the transaction commits.
 */
// DriverQueue.status is a journeyStatusMap id, so a queue-allocated order's
// entry must mirror the in-flight journey: loading stages goToLoadingPlace (5) /
// loading (6) / loaded (7), then journeyStarted (8), then journeyCompleted (9).
// This helper advances the entry holding a given order through those progress
// ids (idempotent — no-op if the entry is gone, closed, or already there).
exports.updateQueueEntryOnJourneyProgress = async ({
  shipperRequestUniqueId,
  userUniqueId,
  journeyStatusId,
}) => {
  const executor = db();
  let [rows] = await executor.query(
    `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate, status
     FROM DriverQueue
     WHERE shipperRequestUniqueId = ? AND status IN (
       ${QUEUE_STATUS.AGREED},
       ${QUEUE_STATUS.GO_TO_LOADING_PLACE},
       ${QUEUE_STATUS.LOADING},
       ${QUEUE_STATUS.LOADED}
     )
       AND queueDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestUniqueId],
  );
  // LEGACY FALLBACK: entries AGREED by the pre-linkage bid path carry no
  // shipperRequestUniqueId (driver-id only). They are job holders too — mirror
  // their journey progress by driver id so they never stall on AGREED.
  if (rows.length === 0 && userUniqueId) {
    [rows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       WHERE vd.driverUserUniqueId = ? AND dq.status = ${QUEUE_STATUS.AGREED}
         AND dq.shipperRequestUniqueId IS NULL
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [userUniqueId],
    );
  }
  if (rows.length === 0 || rows[0].status === journeyStatusId) {
    return { updated: false };
  }

  const entry = rows[0];
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.JOURNEY_PROGRESS,
    performedBy: userUniqueId || null,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: journeyStatusId,
      // Backfill the linkage while we are here (no-op when already set) so
      // later lifecycle steps and board reads resolve the entry by order.
      shipperRequestUniqueId,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: userUniqueId || null,
    },
    conditions: { queueId: entry.queueId },
  });
  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });

  return { updated: true, queueUniqueId: entry.queueUniqueId };
};
exports.closeEntryOnJourneyCompletion = async ({
  shipperRequestUniqueId,
  userUniqueId,
  driverName = "",
}) => {
  const executor = db();
  let [rows] = await executor.query(
    `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate, status
     FROM DriverQueue
     WHERE shipperRequestUniqueId = ? AND status IN (
       ${QUEUE_STATUS.AGREED},
       ${QUEUE_STATUS.GO_TO_LOADING_PLACE},
       ${QUEUE_STATUS.LOADING},
       ${QUEUE_STATUS.LOADED},
       ${QUEUE_STATUS.JOURNEY_STARTED}
     )
       AND queueDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestUniqueId],
  );
  // LEGACY FALLBACK: pre-linkage AGREED entries carry no order linkage —
  // resolve by driver id so a completed job still closes the slot instead of
  // leaving a permanent loadingNow ghost.
  if (rows.length === 0 && userUniqueId) {
    [rows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       WHERE vd.driverUserUniqueId = ? AND dq.status = ${QUEUE_STATUS.AGREED}
         AND dq.shipperRequestUniqueId IS NULL
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [userUniqueId],
    );
  }
  if (rows.length === 0) {
    return { closed: false };
  }

  const entry = rows[0];
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.JOURNEY_COMPLETED,
    performedBy: userUniqueId || null,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.JOURNEY_COMPLETED,
      shipperRequestUniqueId: null,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: userUniqueId || null,
      queueDeletedAt: currentDate(),
      queueDeletedBy: userUniqueId || null,
    },
    conditions: { queueId: entry.queueId },
  });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    messageType: "queue_driver_completed_delivery",
    message: {
      queueUniqueId: entry.queueUniqueId,
      shipperRequestUniqueId,
      driverName,
    },
  });

  return { closed: true, queueUniqueId: entry.queueUniqueId };
};
/**
 * Pre-journey gate for a queue-order accept. Runs BEFORE the accept flow creates
 * the Journey/agreement, so a stale accept can never create a Journey.
 *
 * Decision table (shipper state → accepting driver → verdict):
 *  - Entry REQUESTED    + accepting driver is the holder  → allowed.
 *  - Entry REQUESTED    + accepting driver is NOT holder  → 409 "passed to
 *    another driver" (the offer had already advanced).
 *  - Entry NO_ANSWER(16)+ accepting driver is the holder  → allowed (LATE
 *    ACCEPT honoured — no other driver took the order since the timeout).
 *  - Entry NO_ANSWER(16)+ any other driver, or no entry holds the order
 *    (already released/assigned/closed)                       → 409.
 *  - No live entry for the order                              → 409.
 *
 * @returns {Promise<{ queueUniqueId: string, status: number }>}
 * @throws {AppError} 409 — offer no longer acceptable.
 */
const assertQueueOfferAcceptable = async ({
  shipperRequestUniqueId,
  driverUserUniqueId,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueUniqueId, dq.status, vd.driverUserUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.shipperRequestUniqueId = ?
       AND dq.status IN (${QUEUE_STATUS.REQUESTED}, ${QUEUE_STATUS.NO_ANSWER_FROM_DRIVER})
       AND dq.queueDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError(
      "This queue offer is no longer available for acceptance. The offer window may have expired and the order moved to another driver.",
      AppError.CONFLICT,
    );
  }
  if (rows[0].driverUserUniqueId !== driverUserUniqueId) {
    throw new AppError(
      "This offer was no longer valid for your queue position; the order has already passed to another driver.",
      AppError.CONFLICT,
    );
  }
  return { queueUniqueId: rows[0].queueUniqueId, status: rows[0].status };
};

exports.assertQueueOfferAcceptable = assertQueueOfferAcceptable;

/**
 * AUTO-ENROLL A BID WINNER — create a queue entry for a driver who wins a bid
 * WITHOUT ever holding a queue row.
 *
 * The problem: a bid-base order (ShipperRequest.isBiddingApproved = TRUE) is
 * matched by the distance matcher / bidding board, not by FIFO, and those paths
 * create a bare JourneyDecision and NEVER write the order onto a DriverQueue
 * row. So the winning driver has no queue row at all when the shipper (or queue
 * org admin) accepts their bid. Before this function that accept silently
 * no-op'd the queue bookkeeping, and the driver got NO yard number — invisible
 * to the yard board while holding a job for that very org.
 *
 * How the queue entry is created, in order:
 *  1. Resolve the winning org from the ORDER via its ShipperRequestBatch row
 *     (batch-canonical — the per-order column was dropped). `queueOrganization-
 *     UniqueId` is only a fast path when the caller already resolved it; it is
 *     NEVER taken from the request body, so a client cannot enroll a driver
 *     into an org the order does not belong to. The order's shipper is read in
 *     the same query and becomes the entry's `targetedShipperUserUUID`.
 *  2. Read EVERY live entry the driver holds today, in any org, under FOR UPDATE
 *     (`LIVE_ENTRY_STATUSES` — not `IN_QUEUE_STATUSES`, whose narrower set
 *     cannot see a driver who is already mid-job).
 *  3. Fence: if any of those entries is a JOB status (3/5/6/7/8) carrying an
 *     order, refuse with 409. Already booked — never double-book. An `agreed`
 *     row with NO linkage is the legacy ghost and stays checkout-able.
 *  4. Fence: if the driver holds a live position in ANOTHER org, `checkout()`
 *     it first. Reusing the canonical checkout (not a hand-rolled retire) means
 *     a `requested` / `noAnswerFromDriver` order they were holding is properly
 *     terminalized and re-offered to the next driver instead of being
 *     stranded. This is what keeps one-queue-per-driver-per-day true.
 *  5. Fence: resolve the driver's most recent ACTIVE vehicle assignment. A yard
 *     number is per-truck and DriverQueue requires a `vehicleDriverUniqueId`,
 *     so with none there is nothing to number — refuse with 409.
 *  6. Issue the WRITE-ONCE yard `loadingOrderNumber` via `nextLoadingNumber`,
 *     from the same one-continuous-sequence-per-org+day counter every other
 *     accept path uses.
 *  7. Insert through the SHARED check-in writer (`insertQueueEntryRow`), status
 *     `agreed` in a single statement. It is never written as `waiting` and then
 *     updated: a transient waiting row would count the winner in everyone
 *     else's `waitingAhead` between the insert and the update. The writer also
 *     allocates `queueNumber` per (org, date, vehicle type) and snapshots the
 *     row into DriverQueueHistory under the `auto_enrolled` event, so the audit
 *     trail distinguishes a synthesized entry from a real check-in.
 *
 * Effect: the winner is in the yard exactly like any other accepted driver —
 * `agreed`, carrying the order linkage and a yard number — so the board shows
 * what they are loading and the journey-progress/completion mirror (which
 * matches entries by `shipperRequestUniqueId`) picks the entry up from the
 * start instead of never finding it.
 *
 * Deliberately fail-closed: the two 409s above propagate and roll back the
 * accept transaction, because handing a job to a driver who is already booked
 * or has no truck is worse than refusing the accept.
 *
 * @param {Object} params
 * @param {import("pool").PoolConnection} params.executor - Transaction
 *   executor; the caller's accept transaction.
 * @param {string} params.shipperRequestUniqueId - The order won.
 * @param {string} params.driverUserUniqueId - The winning driver.
 * @param {string} [params.queueOrganizationUniqueId] - Pre-resolved winning org
 *   (the caller already has it); re-resolved from the order when omitted.
 * @param {string} [params.actorUserUniqueId] - Who performed the accept
 *   (shipper or queue org admin), recorded as `queueCreatedBy`.
 * @returns {Promise<{queueUniqueId: string, queueNumber: number,
 *   loadingOrderNumber: number, vehicleTypeUniqueId: string,
 *   checkedOutOrganizationUniqueId: string|null}>} The created entry. Rejects
 *   (409) when the driver is already on a job or has no active vehicle.
 */
const autoEnrollBidWinner = async ({
  executor,
  shipperRequestUniqueId,
  driverUserUniqueId,
  queueOrganizationUniqueId,
  actorUserUniqueId,
}) => {
  // Resolve the winning org from the ORDER (batch-canonical), never from the
  // client, and carry the shipper so the new entry reserves the position for
  // them exactly like a check-in made on their behalf.
  let orgUniqueId = queueOrganizationUniqueId || null;
  let shipperUserUniqueId = null;
  const [[orderRow]] = await executor.query(
    `SELECT srb.queueOrganizationUniqueId, sr.userUniqueId AS shipperUserUniqueId
       FROM ShipperRequest sr
       LEFT JOIN ShipperRequestBatch srb
         ON sr.shipperRequestBatchUniqueId = srb.batchUniqueId
      WHERE sr.shipperRequestUniqueId = ?
        AND sr.shipperRequestDeletedAt IS NULL`,
    [shipperRequestUniqueId],
  );
  orgUniqueId = orgUniqueId || orderRow?.queueOrganizationUniqueId || null;
  shipperUserUniqueId = orderRow?.shipperUserUniqueId || null;
  if (!orgUniqueId) {
    throw new AppError(
      "Order is not a queue order; cannot enroll its driver into the queue",
      AppError.CONFLICT,
    );
  }

  const queueDate = today();

  // Every live entry the driver holds today, in ANY org. LIVE_ENTRY_STATUSES —
  // not IN_QUEUE_STATUSES — because the job statuses must be visible here to
  // catch a driver who is already carrying an order.
  const [liveEntries] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.status,
            dq.shipperRequestUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
      WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ?
        AND dq.status IN (${LIVE_ENTRY_STATUSES.join(", ")})
        AND dq.queueDeletedAt IS NULL
      ORDER BY dq.queueId DESC
      FOR UPDATE`,
    [queueDate, driverUserUniqueId],
  );

  // (1) Already holding a job — refuse rather than double-book.
  const jobEntry = liveEntries.find(
    (r) => JOB_STATUSES.includes(r.status) && r.shipperRequestUniqueId,
  );
  if (jobEntry) {
    throw new AppError(
      "Driver is already on an active job and cannot take this one",
      AppError.CONFLICT,
    );
  }

  // (2) Holding a live position in another org — check it out first. Reuses the
  // canonical checkout, which releases/re-offers a REQUESTED or NO_ANSWER order
  // to the next driver before soft-deleting the row.
  const foreignEntry = liveEntries.find(
    (r) => r.queueOrganizationUniqueId !== orgUniqueId,
  );
  if (foreignEntry) {
    // Lazy require breaks the lifecycle → position cycle.
    const { checkout } = require("./position.service");
    await checkout(foreignEntry.queueOrganizationUniqueId, {
      userUniqueId: driverUserUniqueId,
    });
  }

  // (3) A yard number is per-truck; without an active assignment there is no
  // row to hang it on.
  const vehicleDriver = await resolveLatestActiveVehicleDriverForUser({
    driverUserUniqueId,
  });
  if (!vehicleDriver) {
    throw new AppError(
      "Driver has no active vehicle, so no yard number can be issued",
      AppError.CONFLICT,
    );
  }

  // WRITE-ONCE yard number, issued here for the auto-enrolled path exactly as
  // the linked paths issue it at accept — one continuous sequence per org+day.
  const loadingOrderNumber = await nextLoadingNumber(
    executor,
    orgUniqueId,
    queueDate,
  );

  // Lazy require: checkin.service pulls in the dispatch stack.
  const { insertQueueEntryRow } = require("./checkin.service");
  const created = await insertQueueEntryRow({
    executor,
    queueOrganizationUniqueId: orgUniqueId,
    queueDate,
    vehicleDriver,
    createdBy: actorUserUniqueId || driverUserUniqueId,
    // Insert as AGREED, never WAITING-then-update: a transient WAITING row
    // would count the winner in everyone else's waitingAhead for the moment
    // between insert and update.
    status: QUEUE_STATUS.AGREED,
    historyEvent: HISTORY_EVENT.AUTO_ENROLLED,
    targetedShipperUserUUID: shipperUserUniqueId,
    // Accept happens server-side from the admin's phone; no driver GPS here.
    driverLatitude: null,
    driverLongitude: null,
    loadingOrderNumber,
    shipperRequestUniqueId,
    // The entry is born AGREED with the order already attached, so the accept
    // instant must be stamped here — the normal check-in path leaves agreedAt
    // NULL because it only agrees later, in linkQueueEntryOnAccept.
    agreedAt: currentDate(),
  });
  // ER_DUP_ENTRY means the (org, date, vehicleType, queueNumber) key lost a race
  // with a concurrent enrollment, so NO row was written. Report it as a conflict
  // instead of returning a queueUniqueId that does not exist — the caller's
  // transaction rolls back and the accept can be retried.
  if (created.duplicate) {
    throw new AppError(
      "Could not allocate a queue position for this bid winner (concurrent queue join). Please retry.",
      AppError.CONFLICT,
    );
  }

  await emitQueueSnapshot({ queueOrganizationUniqueId: orgUniqueId, queueDate });

  return {
    queueUniqueId: created.queueUniqueId,
    queueNumber: created.queueNumber,
    loadingOrderNumber,
    vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
    checkedOutOrganizationUniqueId: foreignEntry
      ? foreignEntry.queueOrganizationUniqueId
      : null,
  };
};

exports.autoEnrollBidWinner = autoEnrollBidWinner;

/**
 * Driver accepts the queue offer → the entry is marked `agreed` (leaves the
 * dispatch line; journey progress is tracked on the driver's JourneyDecisions /
 * DriverRequest journeyStatusId). Called from the accept flow after the
 * JourneyDecision moves to acceptedByDriver.
 *
 * Enforces the same gate as assertQueueOfferAcceptable — status IN (REQUESTED,
 * NO_ANSWER) + holder match — under a FOR UPDATE lock so a concurrent
 * advance/stale-holder-release cannot sneak an order onto another driver
 * between the pre-check and here. A REQUESTED holder that was already
 * reassigned (order on another driver's entry now) fails with a 409; a
 * NO_ANSWER holder whose order nobody else took successfully late-accepts.
 * BID-BASE orders with neither a linked entry nor a live own entry are
 * AUTO-ENROLLED (autoEnrollBidWinner) so the winner still gets a queue row and
 * yard number; a bid whose org cannot be resolved still no-ops, so the shipper's
 * accept is never blocked by queue bookkeeping.
 */
exports.markEntryAgreed = async ({
  shipperRequestUniqueId,
  userUniqueId,
  bidOrder = false,
  queueOrganizationUniqueId = null,
  actorUserUniqueId = null,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status,
            dq.loadingOrderNumber,
            vd.driverUserUniqueId, u.fullName AS driverName, u.phoneNumber AS driverPhoneNumber,
            v.licensePlate, vt.vehicleTypeName
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId         = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId    = v.vehicleTypeUniqueId
     WHERE dq.shipperRequestUniqueId = ?
       AND dq.status IN (${QUEUE_STATUS.REQUESTED}, ${QUEUE_STATUS.NO_ANSWER_FROM_DRIVER})
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC LIMIT 1
     FOR UPDATE`,
    [shipperRequestUniqueId],
  );
  let entry = rows[0] || null;
  if (!entry && bidOrder) {
    // BID-BASE orders never link a DriverQueue row (the offer lives on the
    // JourneyDecision, see findNearbyDrivers/handleWaitingRequest), so the
    // linked-entry lookup above always misses. Fall back to the accepting
    // driver's OWN active entry (they leave the line by taking a job either
    // way). No order linkage is written — the bid offer's lifecycle follows
    // the JourneyDecision, not the entry.
    const [ownRows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status,
              vd.driverUserUniqueId, u.fullName AS driverName, u.phoneNumber AS driverPhoneNumber,
              v.licensePlate, vt.vehicleTypeName
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
       JOIN Vehicle v          ON v.vehicleUniqueId         = vd.vehicleUniqueId
       JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId    = v.vehicleTypeUniqueId
       WHERE vd.driverUserUniqueId = ?
         AND dq.queueDate = ?
         AND dq.status = ${QUEUE_STATUS.WAITING}
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1
       FOR UPDATE`,
      [userUniqueId, today()],
    );
    entry = ownRows[0] || null;
  }
  if (!entry && !bidOrder) {
    throw new AppError(
      "This queue offer is no longer available for acceptance. The offer window may have expired and the order moved to another driver.",
      AppError.CONFLICT,
    );
  }
  // BID-BASE order with NO linked entry AND no live waiting entry for the
  // driver: the offer was surfaced by the creation/distance matcher while the
  // driver was NOT in any line. Auto-enroll them so the winner still receives a
  // queue row and the yard `loadingOrderNumber` every other accept path issues.
  // The enrollment is allowed to fail closed on a genuine conflict (driver
  // already on a job, or no active vehicle) — those must not silently hand out a
  // job the driver cannot perform.
  if (entry === null) {
    // Reaching here implies bidOrder === true (the guard above throws otherwise).
    const enrolled = await autoEnrollBidWinner({
      executor,
      shipperRequestUniqueId,
      driverUserUniqueId: userUniqueId,
      queueOrganizationUniqueId,
      actorUserUniqueId,
    });
    return { updated: true, autoEnrolled: true, ...enrolled };
  }
  if (entry.driverUserUniqueId !== userUniqueId) {
    throw new AppError(
      "This offer was no longer valid for your queue position; the order has already passed to another driver.",
      AppError.CONFLICT,
    );
  }
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.ACCEPT,
    performedBy: userUniqueId || null,
  });
  // WRITE-ONCE yard-entrance number, issued AT ACCEPT — the same rule
  // linkQueueEntryOnAccept applies on the non-FIFO paths, so EVERY accept
  // stamps loadingOrderNumber. ONE continuous sequence per org+day: the
  // first shipper's trucks take 1,2,3, the next shipper's continue 4,5,6,7.
  // The FOR UPDATE row lock above serializes concurrent issuers reading MAX.
  let loadingOrderNumber = entry.loadingOrderNumber ?? null;
  if (loadingOrderNumber === null) {
    loadingOrderNumber = await nextLoadingNumber(
      executor,
      entry.queueOrganizationUniqueId,
      entry.queueDate,
    );
  }
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.AGREED,
      // Stamp the order linkage on the BID-ORDER fallback path too: the shipper
      // selects a winner whose own entry was never linked (the board offer was a
      // bare JourneyDecision). Without the linkage the board cannot show WHAT the
      // winner is loading (activeOrder) and the journey-progress/completion
      // mirror (which matches entries by shipperRequestUniqueId) never finds this
      // entry — it would stay AGREED forever after the job ends. The FIFO path
      // already carries the linkage, so this is a no-op there (same value).
      shipperRequestUniqueId,
      agreedAt: currentDate(),
      loadingOrderNumber,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: userUniqueId || null,
    },
    conditions: { queueId: entry.queueId },
  });
  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    messageType: "queue_order_assigned",
  });
  await notifyShipperOfQueueEvent({
    executor,
    shipperRequestUniqueId,
    messageType: "queue_order_assigned",
    message: "Driver assigned to your queue order",
    data: {
      driver: {
        driver: {
          driverName: entry.driverName,
          driverPhoneNumber: entry.driverPhoneNumber,
        },
        vehicle: {
          licensePlate: entry.licensePlate,
          vehicleTypeName: entry.vehicleTypeName,
        },
      },
      queue: {
        queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
        queueDate: entry.queueDate,
      },
    },
  });
  return { updated: true };
};
