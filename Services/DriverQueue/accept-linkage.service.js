"use strict";

const { currentDate } = require("../../Utils/CurrentDate");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const {
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
} = require("../../Utils/QueueSocket");
const logger = require("../../Utils/logger");
const {
  today,
  QUEUE_STATUS,
  HISTORY_EVENT,
  IN_QUEUE_STATUSES,
  logQueueHistory,
  nextLoadingNumber,
} = require("./helpers");

/**
 * ACCEPT LINKAGE — the root-cause fix for "driver 2 has a job but the queue
 * says WAITING".
 *
 * FIFO offers self-link the entry (status REQUESTED + shipperRequestUniqueId)
 * at offer time, and `markEntryAgreed` finalizes them on accept. BID-BASE
 * orders (ShipperRequest.isBiddingApproved = TRUE) are matched on the bidding
 * board / check-in pull / distance matcher instead: those paths create a bare
 * JourneyDecision and never write the order onto the DriverQueue entry — so a
 * driver who ACCEPTED such an order kept status 1 (WAITING) and still counted
 * in everyone's waitingAhead. The yard, the status board and myPosition all
 * saw "waiting, position N" while the driver held an accepted job.
 *
 * `linkQueueEntryOnAccept` closes that gap for EVERY accept path. It is called
 * from `updateJourneyStatus` (Services/JourneyStatus/update.service.js) — the
 * single choke point all matchers flow through — right after the decision
 * lands on acceptedByDriver (3).
 *
 * Guards (all four must hold — otherwise this is a no-op and the existing
 * FIFO bookkeeping stays authoritative):
 *   1. The accepting driver has a live entry today (status 1/2/16/18, not
 *      soft-deleted) — their own entry, in any org (one-queue-per-day fence).
 *   2. That entry holds NO order (shipperRequestUniqueId IS NULL) — a FIFO
 *      REQUESTED holder is finalized by markEntryAgreed instead; re-linking
 *      here could stamp a second order onto the entry.
 *   3. No OTHER live entry already holds this order (FIFO linked, REQUESTED/
 *      AGREED holder) — then the FIFO flow owns the linkage and must not be
 *      disturbed.
 *   4. The order belongs to a queue organization (batch-canonical) — street /
 *      nearby / company jobs never touch DriverQueue.
 *
 * Effect: the moment the driver taps accept, their entry flips to AGREED with
 * the order linked — they leave the waiting line, every derived linePosition
 * behind them renumbers down by one, the board moves them to the loading-now
 * lane, and their yard gate verdict becomes PASS. Downstream lifecycle
 * (journey progress 5/6/7/8 mirroring, closeEntryOnJourneyCompletion,
 * releaseQueueEntryAfterDriverCancel) matches entries by shipperRequestUniqueId
 * and starts working for these orders automatically.
 *
 * Idempotent: re-running finds the entry already AGREED-with-linkage and
 * returns { linked: false }.
 *
 * @param {Object} params
 * @param {string} params.shipperRequestUniqueId - The accepted order.
 * @param {string} params.driverUserUniqueId - The accepting driver.
 * @param {string} [params.actorUserUniqueId] - Who performed the accept
 *   (recorded in history/audit); defaults to the driver.
 * @returns {Promise<{linked: boolean, queueUniqueId: string|null}>}
 */
const linkQueueEntryOnAccept = async ({
  shipperRequestUniqueId,
  driverUserUniqueId,
  actorUserUniqueId,
}) => {
  if (!shipperRequestUniqueId || !driverUserUniqueId) {
    return { linked: false, queueUniqueId: null };
  }
  const executor = db();
  const queueDate = today();
  const actor = actorUserUniqueId || driverUserUniqueId;

  try {
    // Guard 4: queue org orders only (batch-canonical queueOrganizationUniqueId).
    const [[order]] = await executor.query(
      `SELECT srb.queueOrganizationUniqueId
       FROM ShipperRequest sr
       LEFT JOIN ShipperRequestBatch srb
         ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
       WHERE sr.shipperRequestUniqueId = ?
         AND sr.shipperRequestDeletedAt IS NULL
       LIMIT 1`,
      [shipperRequestUniqueId],
    );
    if (!order?.queueOrganizationUniqueId) {
      return { linked: false, queueUniqueId: null };
    }

    // Guard 3: another live entry (any driver) already holds the order —
    // the FIFO linkage owns it; never create a second holder.
    const [holders] = await executor.query(
      `SELECT dq.queueId
       FROM DriverQueue dq
       WHERE dq.shipperRequestUniqueId = ?
         AND dq.queueDeletedAt IS NULL
         AND dq.status IN (${QUEUE_STATUS.REQUESTED}, ${QUEUE_STATUS.AGREED},
           ${QUEUE_STATUS.GO_TO_LOADING_PLACE}, ${QUEUE_STATUS.LOADING},
           ${QUEUE_STATUS.LOADED}, ${QUEUE_STATUS.JOURNEY_STARTED})
       LIMIT 1
       FOR UPDATE`,
      [shipperRequestUniqueId],
    );
    if (holders.length > 0) {
      return { linked: false, queueUniqueId: null };
    }

    // Guard 1 + 2: the accepting driver's own live, UNLINKED entry.
    const [entries] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId,
              dq.queueDate, dq.status, vd.driverUserUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       WHERE dq.queueDate = ?
         AND vd.driverUserUniqueId = ?
         AND dq.shipperRequestUniqueId IS NULL
         AND dq.status IN (${IN_QUEUE_STATUSES.join(", ")})
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1
       FOR UPDATE`,
      [queueDate, driverUserUniqueId],
    );
    if (entries.length === 0) {
      // No live entry today (e.g. driver was force-checked-in after the job
      // landed, or accepted while not in a queue) — nothing to link.
      return { linked: false, queueUniqueId: null };
    }
    const entry = entries[0];

    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      event: HISTORY_EVENT.ACCEPT,
      performedBy: actor,
    });
    // WRITE-ONCE yard-entrance number, issued AT ACCEPT — ONE continuous
    // sequence per org+day (A:1,2,3 → B:4,5,6,7): the shipper of the lowest
    // live number is the serving shipper, and within their turn their trucks
    // enter in number order. Guard-3's FOR UPDATE on order holders + this
    // entry's lock serialize concurrent issuers reading the same MAX.
    const loadingOrderNumber = await nextLoadingNumber(
      executor,
      entry.queueOrganizationUniqueId,
      entry.queueDate,
    );
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: QUEUE_STATUS.AGREED,
        shipperRequestUniqueId,
        requestedAt: currentDate(),
        agreedAt: currentDate(),
        loadingOrderNumber,
        queueUpdatedAt: currentDate(),
        queueUpdatedBy: actor,
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
      message: {
        queueUniqueId: entry.queueUniqueId,
        driverUserUniqueId,
        shipperRequestUniqueId,
      },
    });

    logger.info("Queue entry linked to accepted order (non-FIFO path)", {
      queueUniqueId: entry.queueUniqueId,
      shipperRequestUniqueId,
      driverUserUniqueId,
      loadingOrderNumber,
      previousStatus: entry.status,
    });
    return { linked: true, queueUniqueId: entry.queueUniqueId };
  } catch (error) {
    // Best-effort bookkeeping: an accept must never 500 because the queue
    // linkage failed. The status transition itself has already committed.
    logger.error("linkQueueEntryOnAccept failed (order accepted, linkage skipped)", {
      error: error.message,
      shipperRequestUniqueId,
      driverUserUniqueId,
    });
    return { linked: false, queueUniqueId: null };
  }
};

/**
 * LOSER RELEASE — generalized counterpart for the bidding board.
 *
 * When the shipper selects a winner, every OTHER driver whose queue entry
 * carries THIS order must let it go. With the accept-linkage above, a loser
 * who already ACCEPTED the bid holds their entry in AGREED-with-linkage — the
 * legacy `releaseEntryForUnselectedBidder` only matched REQUESTED/NO_ANSWER
 * entries and missed them, leaving a phantom job holder blocking the line.
 * This releases AGREED entries too (only while the journey has not started —
 * stage 5+ means the driver is physically loading and the order is theirs by
 * right of work, which the shipper-select flow never reaches for a loser).
 *
 * Kept distinct from `releaseEntryForUnselectedBidder` (REQUESTED-only, no
 * 4xx risk) so the shipper-select flow can call THIS unconditionally and the
 * legacy callers stay untouched.
 *
 * @param {Object} params
 * @param {string} params.shipperRequestUniqueId - The order the driver lost.
 * @param {string} params.userUniqueId - The loser driver's user unique id.
 * @param {string} [params.actorUserUniqueId] - Who performed the selection.
 * @returns {Promise<{released: boolean}>}
 */
const releaseAgreedEntryForUnselectedBidder = async ({
  shipperRequestUniqueId,
  userUniqueId,
  actorUserUniqueId,
}) => {
  if (!shipperRequestUniqueId || !userUniqueId) {
    return { released: false };
  }
  const executor = db();
  try {
    const [entries] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId,
              dq.queueDate, dq.status
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       WHERE dq.shipperRequestUniqueId = ?
         AND vd.driverUserUniqueId = ?
         AND dq.queueDeletedAt IS NULL
         AND dq.status IN (${QUEUE_STATUS.REQUESTED}, ${QUEUE_STATUS.NO_ANSWER_FROM_DRIVER},
           ${QUEUE_STATUS.AGREED})
       LIMIT 1
       FOR UPDATE`,
      [shipperRequestUniqueId, userUniqueId],
    );
    if (entries.length === 0) {
      return { released: false };
    }
    const entry = entries[0];
    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      event: HISTORY_EVENT.NOT_SELECTED,
      performedBy: actorUserUniqueId || null,
    });
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: QUEUE_STATUS.WAITING,
        requestedAt: null,
        agreedAt: null,
        shipperRequestUniqueId: null,
        loadingOrderNumber: null, // number lives only while holding the job
        queueUpdatedAt: currentDate(),
        queueUpdatedBy: actorUserUniqueId || null,
      },
      conditions: { queueId: entry.queueId },
    });
    await emitQueueSnapshot({
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      queueDate: entry.queueDate,
    });
    return { released: true };
  } catch (error) {
    logger.error("releaseAgreedEntryForUnselectedBidder failed", {
      error: error.message,
      shipperRequestUniqueId,
      userUniqueId,
    });
    return { released: false };
  }
};

module.exports = {
  linkQueueEntryOnAccept,
  releaseAgreedEntryForUnselectedBidder,
};
