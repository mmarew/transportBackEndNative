"use strict";

/**
 * ShipperRequest status reconciliation.
 *
 * WHY THIS EXISTS
 * ---------------
 * `getDetailedJourneyData` (Services/ShipperRequest/read/detailed.service.js)
 * used to persist its status corrections inline, which made every GET of
 * `/api/user/getShipperRequest4allOrSingleUser` mutate the database.
 *
 * A cancelled request carries no supporting (positive) JourneyDecision, so it
 * always looked "stale" and was rewritten to `waiting` (1). An admin-cancelled
 * order therefore reverted to `waiting` on the next read, and — because
 * `waiting` is what the queue boards filter on — got auto-offered to checking-in
 * drivers again. The read path now only *projects* corrections onto the response;
 * persisting them is this job's responsibility.
 *
 * WHAT IT DOES
 * ------------
 *   1. advance — a live request whose JourneyDecisions moved ahead of it adopts
 *                the furthest decision status.
 *   2. reset   — a live request whose supporting decisions have all gone
 *                terminal returns to `waiting` so it can be re-offered.
 *
 * EXEMPTION (company_target)
 * --------------------------
 * A company_target slot is `acceptedByShipper` from the moment the shipper picks
 * the winning company until the company assigns a driver — and its
 * JourneyDecision is only created at assignment time. It therefore has no
 * supporting decision for that whole window, which rule 2 read as staleness and
 * reset to `waiting`, un-slotting the batch within a reconcile tick. Slots whose
 * batch still has a live `accepted_by_shipper` company bid are exempt; the
 * exemption lifts as soon as that bid is cancelled/rejected/expired.
 *
 * SAFETY
 * ------
 * Both operations are restricted to `activeJourneyStatuses`, so a cancelled,
 * completed, rejected — or any future non-active — status is never rewritten.
 * Each UPDATE is a compare-and-set on the status it was selected with, so a
 * cancellation landing between SELECT and UPDATE wins and the row is skipped.
 */

const { pool } = require("../../Middleware/Database.config");
const {
  journeyStatusMap,
  activeJourneyStatuses,
  supportingDecisionStatuses,
} = require("../../Utils/ListOfSeedData");
const { currentDate } = require("../../Utils/CurrentDate");
const { TIME } = require("../../Utils/Constants");
const logger = require("../../Utils/logger");

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_BATCHES = 50;
const DEFAULT_INTERVAL_SECONDS = 60;
const LOG_SAMPLE_SIZE = 10;

/**
 * Live requests whose decisions moved ahead of the request itself.
 *
 * Keyset-paginated on `shipperRequestId` (see runPhase): without an ORDER BY +
 * cursor every batch re-reads the same arbitrary page and the tail of the table
 * is never reached.
 */
const findAdvanceableRequests = async (executor, limit, afterId = 0) => {
  const [rows] = await executor.query(
    `SELECT sr.shipperRequestId,
            sr.journeyStatusId AS currentStatus,
            MAX(jd.journeyStatusId) AS maxDecisionStatus
     FROM ShipperRequest sr
     JOIN JourneyDecisions jd
       ON jd.shipperRequestId = sr.shipperRequestId
     WHERE sr.journeyStatusId IN (?)
       AND sr.shipperRequestDeletedAt IS NULL
       AND jd.journeyStatusId IN (?)
       AND sr.shipperRequestId > ?
     GROUP BY sr.shipperRequestId, sr.journeyStatusId
     HAVING maxDecisionStatus > sr.journeyStatusId
     ORDER BY sr.shipperRequestId
     LIMIT ?`,
    [activeJourneyStatuses, supportingDecisionStatuses, afterId, limit],
  );
  return rows;
};

/**
 * Live requests whose supporting decisions are all gone.
 *
 * Keyset-paginated like findAdvanceableRequests, and rows already sitting at the
 * reset target are excluded: `waiting` requests legitimately have no supporting
 * decision, so leaving them in made every page self-poison — the row was skipped
 * as a no-op, stayed in the result set, and permanently occupied the first page
 * so later rows were never reached.
 */
const findStaleActiveRequests = async (executor, limit, afterId = 0) => {
  const [rows] = await executor.query(
    `SELECT sr.shipperRequestId, sr.journeyStatusId AS currentStatus
     FROM ShipperRequest sr
     WHERE sr.journeyStatusId IN (?)
       AND sr.shipperRequestDeletedAt IS NULL
       AND sr.journeyStatusId <> ?
       AND sr.shipperRequestId > ?
       AND NOT EXISTS (
         SELECT 1
         FROM JourneyDecisions jd
         WHERE jd.shipperRequestId = sr.shipperRequestId
           AND jd.journeyStatusId IN (?)
       )
       -- EXEMPTION: a company_target slot is acceptedByShipper BEFORE any driver
       -- is assigned to it, so "no supporting decision" is its normal state while
       -- it waits for the company to pick a driver — not staleness. Resetting it
       -- to waiting silently un-slot the batch: /api/company/assignments/auto
       -- only discovers slots at acceptedByShipper, so it answered "No unassigned
       -- slots available" for a batch whose every slot was still unassigned.
       -- Scoped to a live accepted bid, so cancelling/rejecting/expiring that bid
       -- withdraws the exemption and the slots reconcile back to waiting on their
       -- own (bidUpdate.service.js drives that transition explicitly).
       AND NOT (
         sr.journeyStatusId = ?
         AND EXISTS (
           SELECT 1
           FROM ShipperRequestBatch b
           JOIN CompanyBidRequest cbr
             ON cbr.shipperRequestBatchUniqueId = b.batchUniqueId
           WHERE b.batchUniqueId = sr.shipperRequestBatchUniqueId
             AND b.requestMode = 'company_target'
             AND cbr.bidStatus = 'accepted_by_shipper'
             AND cbr.companyBidRequestDeletedAt IS NULL
         )
       )
     ORDER BY sr.shipperRequestId
     LIMIT ?`,
    [
      activeJourneyStatuses,
      journeyStatusMap.waiting,
      afterId,
      supportingDecisionStatuses,
      journeyStatusMap.acceptedByShipper,
      limit,
    ],
  );
  return rows;
};

/**
 * Compare-and-set one row. The status the row was selected with must still be
 * in place, so a cancellation that landed in between is never clobbered.
 * @returns {Promise<boolean>} true when the row was updated
 */
const applyStatusChange = async (executor, shipperRequestId, fromStatus, toStatus) => {
  const [result] = await executor.query(
    `UPDATE ShipperRequest
     SET journeyStatusId = ?, shipperRequestUpdatedAt = ?
     WHERE shipperRequestId = ?
       AND journeyStatusId = ?
       AND journeyStatusId IN (?)`,
    [toStatus, currentDate(), shipperRequestId, fromStatus, activeJourneyStatuses],
  );
  return result.affectedRows > 0;
};

/**
 * Reconciles ShipperRequest statuses against their JourneyDecisions.
 *
 * @param {Object}   [options]
 * @param {Object}   [options.executor]  Pool or transaction connection.
 * @param {boolean}  [options.dryRun]    Report what would change, write nothing.
 * @param {number}   [options.batchSize] Rows per statement.
 * @param {number}   [options.maxBatches] Safety bound on work per run.
 * @returns {Promise<{advanced:number,reset:number,skippedRace:number,dryRun:boolean,details:Array}>}
 */
const reconcileShipperRequestStatuses = async ({
  executor = pool,
  dryRun = false,
  batchSize = DEFAULT_BATCH_SIZE,
  maxBatches = DEFAULT_MAX_BATCHES,
} = {}) => {
  const summary = { advanced: 0, reset: 0, skippedRace: 0, dryRun, details: [] };

  const runPhase = async ({ finder, toStatus, kind, shouldApply }) => {
    // Keyset cursor: each batch must start where the previous one ended. Without
    // it every iteration re-reads the same first page, so a page of rows that
    // cannot change (already at target, or skipped) is re-processed maxBatches
    // times and the rest of the table is never reconciled.
    let cursor = 0;
    for (let batch = 0; batch < maxBatches; batch += 1) {
      const rows = await finder(executor, batchSize, cursor);
      if (rows.length === 0) break;
      for (const row of rows) {
        const nextStatus = shouldApply
          ? shouldApply(row)
          : toStatus;
        if (nextStatus === null || Number(nextStatus) === Number(row.currentStatus)) {
          continue;
        }
        summary.details.push({
          shipperRequestId: row.shipperRequestId,
          from: row.currentStatus,
          to: nextStatus,
          kind,
        });
        if (dryRun) {
          if (kind === "advance") summary.advanced += 1;
          else summary.reset += 1;
          continue;
        }
        const changed = await applyStatusChange(
          executor,
          row.shipperRequestId,
          row.currentStatus,
          nextStatus,
        );
        if (changed) {
          if (kind === "advance") summary.advanced += 1;
          else summary.reset += 1;
        } else {
          // Status changed under us (e.g. an admin cancellation) — leave it be.
          summary.skippedRace += 1;
        }
      }
      const lastId = rows[rows.length - 1].shipperRequestId;
      // Guard against a finder that ignores the cursor: without this the loop
      // would spin maxBatches times over one identical page.
      if (rows.length < batchSize || lastId <= cursor) break;
      cursor = lastId;
    }
  };

  // Advance first: a request pulled forward may then be seen as supported.
  await runPhase({
    finder: findAdvanceableRequests,
    toStatus: null,
    kind: "advance",
    shouldApply: row => row.maxDecisionStatus,
  });

  await runPhase({
    finder: findStaleActiveRequests,
    toStatus: journeyStatusMap.waiting,
    kind: "reset",
  });

  if (summary.details.length > 0) {
    logger.info("@reconcileShipperRequestStatuses: corrections applied", {
      advanced: summary.advanced,
      reset: summary.reset,
      skippedRace: summary.skippedRace,
      dryRun,
      sample: summary.details.slice(0, LOG_SAMPLE_SIZE),
    });
  } else {
    logger.debug("@reconcileShipperRequestStatuses: nothing to reconcile", {
      dryRun,
    });
  }

  return summary;
};

/**
 * Schedules {@link reconcileShipperRequestStatuses} on a fixed interval.
 * @param {Object} [options]
 * @param {number} [options.intervalSeconds]
 * @param {boolean} [options.runImmediately]
 * @returns {{stop:Function, intervalId:any, reconcileNow:Function}}
 */
const startStatusReconciliationService = (options = {}) => {
  const {
    intervalSeconds = DEFAULT_INTERVAL_SECONDS,
    runImmediately = true,
  } = options;

  logger.info("Starting ShipperRequest Status Reconciliation Service", {
    intervalSeconds,
    runImmediately,
    timestamp: new Date().toISOString(),
  });

  const tick = () => {
    reconcileShipperRequestStatuses().catch(error => {
      logger.error("Error in shipper request status reconciliation", {
        error: error.message,
        stack: error.stack,
      });
    });
  };

  if (runImmediately) tick();

  const intervalId = setInterval(
    tick,
    intervalSeconds * TIME.MILLISECONDS_PER_SECOND,
  );

  return {
    stop: () => {
      clearInterval(intervalId);
      logger.info("ShipperRequest Status Reconciliation Service stopped", {
        timestamp: currentDate(),
      });
    },
    intervalId,
    reconcileNow: () => reconcileShipperRequestStatuses(),
  };
};

module.exports = {
  reconcileShipperRequestStatuses,
  startStatusReconciliationService,
  findAdvanceableRequests,
  findStaleActiveRequests,
  DEFAULT_INTERVAL_SECONDS,
};