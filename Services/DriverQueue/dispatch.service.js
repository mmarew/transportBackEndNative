"use strict";

const AppError = require("../../Utils/AppError");
const Config = require("../../Utils/Config");
const { db } = require("../CompanyHelper.service");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const { today, QUEUE_STATUS, MAX_OFFERS_PER_SWEEP } = require("./helpers");
const { offerToDriver } = require("./dispatch-offer.service");

/**
 * Dispatch — manually offer a waiting order to a queue driver (QueueOrgAdmin).
 *
 * Exactly one driver-selection mode must be used:
 *   1. `vehicleTypeUniqueId` → offer to the FRONT waiting driver of that type
 *      (FIFO). `queueUniqueId`/`driverPhoneNumber` must be absent.
 *   2. `queueUniqueId` → offer to a specific queue entry (its driver). The
 *      entry must be `waiting`/`notagreed` in this org for today, of the
 *      order's vehicle type, not have already refused the order, and not be
 *      pinned to a different shipper. If the entry is ALREADY `requested` for
 *      this exact order (e.g. order-create auto-dispatch offered it FIFO), the
 *      dispatch is an idempotent no-op success and returns the existing offer.
 *   3. `driverPhoneNumber` → offer to a specific driver by phone (resolved to
 *      their active vehicle assignment, then their queue entry under the same
 *      rules as mode 2).
 *
 * `driverPhoneNumber` and `queueUniqueId` are mutually exclusive. When either
 * is used, `vehicleTypeUniqueId` may be omitted (it defaults to the order's).
 *
 * @param {Object} data
 * @param {string} data.queueOrganizationUniqueId - UUID of the queue org (required).
 * @param {string} [data.vehicleTypeUniqueId] - FIFO dispatch to front driver of this type.
 * @param {string} [data.queueUniqueId] - Targeted dispatch to this queue entry.
 * @param {string} [data.driverPhoneNumber] - Targeted dispatch to this driver's phone.
 * @param {string} [data.shipperRequestUniqueId] - The order to dispatch (required;
 *   the service resolves it internally).
 * @param {Object} data.user - The acting admin (recorded as performer).
 * @returns {Promise<{message: string, offered: boolean, data: Object|null}>}
 *   On success `{ message: "success", offered: true, data: { queueUniqueId,
 *   queueNumber, driverUserUniqueId, journeyDecisionUniqueId, status: ${QUEUE_STATUS.REQUESTED} } }`.
 * @throws {AppError} 400 - no selection mode given, or both queueUniqueId and
 *   driverPhoneNumber given.
 * @throws {AppError} 404 - queue org not ready, driver phone unknown/inactive,
 *   order unknown, or targeted entry/driver not dispatchable.
 * @throws {AppError} 400 - targeted driver reserved for another shipper or has
 *   no active DriverRequest record.
 */
exports.dispatch = async (data) => {
  const {
    queueOrganizationUniqueId,
    vehicleTypeUniqueId,
    queueUniqueId,
    driverPhoneNumber,
    shipperRequestUniqueId,
    user,
  } = data;
  if (!queueUniqueId && !driverPhoneNumber && !vehicleTypeUniqueId) {
    throw new AppError(
      "Provide vehicleTypeUniqueId (front driver), queueUniqueId, or driverPhoneNumber",
      AppError.BAD_REQUEST,
    );
  }
  if (queueUniqueId && driverPhoneNumber) {
    throw new AppError(
      "Provide either queueUniqueId or driverPhoneNumber, not both",
      AppError.BAD_REQUEST,
    );
  }

  // Resolve a phone number to the driver's active vehicle assignment.
  let targetVehicleDriverUniqueId = null;
  if (driverPhoneNumber) {
    const [driverRows] = await db().query(
      `SELECT vd.vehicleDriverUniqueId
       FROM Users u
       JOIN VehicleDriver vd ON vd.driverUserUniqueId = u.userUniqueId
       WHERE u.phoneNumber = ?
         AND vd.assignmentStatus = 'active'
         AND vd.vehicleDriverDeletedAt IS NULL
       LIMIT 1`,
      [driverPhoneNumber],
    );
    if (driverRows.length === 0) {
      throw new AppError(
        "No active driver found for that phone number",
        AppError.NOT_FOUND,
      );
    }
    targetVehicleDriverUniqueId = driverRows[0].vehicleDriverUniqueId;
  }

  const result = await executeInTransaction(
    () =>
      offerToDriver({
        executor: db(),
        queueOrganizationUniqueId,
        queueDate: today(),
        vehicleTypeUniqueId,
        targetQueueUniqueId: queueUniqueId || null,
        targetVehicleDriverUniqueId,
        shipperRequestUniqueId,
        user,
        throwIfNone: true,
      }),
    { timeout: 15000, logging: false },
  );
  return { message: "success", ...result };
};
/**
 * AUTO-dispatch — called from the ShipperRequest create flow when an order is
 * placed against a queue-enabled QueueOrganization (body.queueOrganizationUniqueId),
 * and from the check-in rescan (rescanPendingQueueOrder) to retry an order that
 * outlived an empty (or all-refusing) queue.
 * Offers the order to the FRONT waiting driver of the order's vehicle type.
 * If the queue is empty, the order stays waiting (a driver can claim it later
 * via manual dispatch, or the order retries on the next check-in).
 */
exports.handleQueueDispatch = async ({
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
  shipperRequestUniqueId,
  user,
}) =>
  executeInTransaction(
    () =>
      offerToDriver({
        executor: db(),
        queueOrganizationUniqueId,
        queueDate: today(),
        vehicleTypeUniqueId,
        shipperRequestUniqueId,
        user,
        throwIfNone: false,
      }),
    { timeout: 15000, logging: false },
  );
/**
 * Check-in auto-dispatch — after a driver checks in, rescan for the OLDEST
 * pending queue orders of the driver's vehicle type that have NO active offer
 * and offer them to the FRONT waiting driver(s) (FIFO, one offer per check-in).
 *
 * Covers the two cases where an order outlives its creation-time dispatch:
 *   1. queue was empty at creation → order stayed `waiting`
 *   2. every driver rejected → order stayed `requested` with no active offer
 *      (see queue-refusal-policy: no re-offer to a driver who already refused)
 *
 * The scan is NOT limited to one order: the FRONT waiting driver may have
 * already rejected the OLDEST pending order (e.g. an order they were offered
 * earlier but refused), so we keep walking the queue of pending orders and
 * attempt each one in FIFO order until an offer actually lands. Each
 * `offerToDriver` marks the front driver `offered`, so the next iteration
 * advances to the next driver — a single check-in can therefore fill several
 * free slots when the org has a backlog.
 *
 * Runs inside the check-in's transaction: reuses the outer connection via
 * `transactionStorage` so the just-created queue entry is visible to
 * `offerToDriver` and the `FOR UPDATE` lock serializes concurrent check-ins.
 * Calls `offerToDriver` directly (not through `handleQueueDispatch`) to avoid
 * nesting a second `executeInTransaction` which would open a separate
 * connection blind to the outer tx's uncommitted rows.
 * Best-effort — returns `{ offered: false, data: null }` when nothing pending.
 */
const rescanPendingQueueOrder = async ({
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
  user,
}) => {
  // When called inside an outer transaction (e.g. checkin), use that
  // transaction's connection so offerToDriver can see the just-created queue
  // entry.  handleQueueDispatch wraps in its OWN executeInTransaction, which
  // opens a new connection blind to the outer tx's uncommitted rows — the
  // front-driver SELECT would miss them and return no match.
  const executor = transactionStorage.getStore() || db();
  const [rows] = await executor.query(
    `SELECT sr.shipperRequestUniqueId
     FROM ShipperRequest sr
     -- queueOrganizationUniqueId is canonical on the batch (srb), inherited via join
     JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
     WHERE srb.queueOrganizationUniqueId = ?
       AND sr.vehicleTypeUniqueId = ?
       AND sr.requestMode <> 'company_target'
       -- Bidding-board orders (isBiddingApproved=TRUE, PER-ORDER) are distance-matched,
       -- never FIFO-dispatched, so skip them here. Orders NOT opened to bidding (FALSE,
       -- or NULL for rows created before the column was back-filled) remain FIFO-offered.
       -- "IS NOT TRUE" is TRUE for both FALSE and NULL, so legacy NULL rows still dispatch.
       AND (sr.isBiddingApproved = FALSE OR sr.isBiddingApproved IS NULL)
       AND sr.journeyStatusId IN (?, ?)
       AND sr.shipperRequestDeletedAt IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM DriverQueue dq
         WHERE dq.shipperRequestUniqueId = sr.shipperRequestUniqueId
           AND dq.status = ${QUEUE_STATUS.REQUESTED}
           AND dq.queueDeletedAt IS NULL
       )
     ORDER BY sr.shipperRequestCreatedAt ASC
     LIMIT ${MAX_OFFERS_PER_SWEEP}`,
    [
      queueOrganizationUniqueId,
      vehicleTypeUniqueId,
      journeyStatusMap.waiting,
      journeyStatusMap.requested,
    ],
  );
  if (rows.length === 0) {
    return { offered: false, data: null };
  }
  for (const row of rows) {
    const result = await offerToDriver({
      executor,
      queueOrganizationUniqueId,
      queueDate: today(),
      vehicleTypeUniqueId,
      shipperRequestUniqueId: row.shipperRequestUniqueId,
      user,
      throwIfNone: false,
    });
    if (result?.offered) {
      return result;
    }
  }
  return { offered: false, data: null };
};
/**
 * Arm the org's currently-FREE queued drivers for order-anchored bid matching.
 *
 * Used at BID ORDER CREATION (Step 2c): findNearbyDrivers only sees drivers who
 * already hold an eligible (waiting/rejectedByDriver) DriverRequest, so a driver
 * who is already in line but whose only request is terminal would never be
 * invited to the just-created board job. This re-arms each free queued driver
 * with a waiting request anchored at their CURRENT queue-entry coordinates, so
 * findNearbyDrivers finds them and isQueued DESC offers them first.
 *
 * Contention policy (matches the check-in pull): a driver whose single active
 * request is engaged elsewhere is SKIPPED — never force-released. The queue
 * waits for the timeout sweepers to clear the foreign hold.
 *
 * Best-effort — a failure to arm one driver never blocks the creation flow.
 *
 * @returns {Promise<void>}
 */
const ensureQueuedDriversReadyForBid = async ({
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
}) => {
  try {
    const executor = transactionStorage.getStore() || db();
    const [rows] = await executor.query(
      `SELECT dq.vehicleDriverUniqueId, vd.driverUserUniqueId,
              dq.driverLatitude, dq.driverLongitude
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       WHERE dq.queueOrganizationUniqueId = ?
         AND dq.queueDate = ?
         AND v.vehicleTypeUniqueId = ?
         -- WAITING = in line, free; CANCELLED_BEFORE_ACCEPT = rejected last
         -- offer but kept position, still eligible for the next one.
         AND dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT})
         AND dq.queueDeletedAt IS NULL`,
      [queueOrganizationUniqueId, today(), vehicleTypeUniqueId],
    );
    if (rows.length === 0) return;

    const {
      ensureWaitingDriverRequest,
    } = require("../ShipperRequest/statusVerification.service");
    for (const entry of rows) {
      try {
        await ensureWaitingDriverRequest(
          executor,
          entry.driverUserUniqueId,
          queueOrganizationUniqueId,
          {
            latitude: entry.driverLatitude,
            longitude: entry.driverLongitude,
            place: "Queue check-in",
          },
        );
      } catch (error) {
        logger.warn("ensureQueuedDriversReadyForBid: arm failed", {
          error: error.message,
          driverUserUniqueId: entry.driverUserUniqueId,
        });
      }
    }
  } catch (error) {
    logger.error("Error in ensureQueuedDriversReadyForBid", {
      error: error.message,
      stack: error.stack,
      queueOrganizationUniqueId,
      vehicleTypeUniqueId,
    });
  }
};
exports.ensureQueuedDriversReadyForBid = ensureQueuedDriversReadyForBid;
// Safety cap per sweep so a pathological backlog can never loop forever.

/**
 * Periodic re-dispatch sweep — safety net for pending queue orders.
 *
 * Orders that outlive their creation-time dispatch (queue empty at creation,
 * or every driver refused) sit in `waiting`/`requested` with no active offer
 * and only retried on the next check-in. This sweep re-runs the same rescan
 * for every (org, vehicle type) pair that currently has at least one waiting
 * driver, and keeps offering until the backlog is drained (each offer marks
 * the front driver `offered`, so the next iteration advances to the next
 * waiting driver). Invoked periodically from automaticTimeout.service so a
 * fresh check-in event is not required to match an order.
 *
 * @returns {Promise<{ message: string, data: { offered: number, advanced: Array } }>}
 */
exports.rescanPendingQueueOrders = async () => {
  const executor = db();
  const queueDate = today();

  // The sweep's offers are stamped on JourneyDecisions.journeyDecisionCreatedBy
  // (FK → Users), so the actor must be a REAL user — the seeded platform
  // "system" user (identity from env, see system.service.js). A fake id makes
  // every sweep offer die on the foreign key and roll back.
  const systemEmail = Config.SUPER_ADMIN.SYSTEM_EMAIL;
  const systemPhone = Config.SUPER_ADMIN.SYSTEM_PHONE;
  const [systemRows] = await executor.query(
    `SELECT userUniqueId FROM Users
     WHERE email = ?
        OR (phoneNumber = ?)
     LIMIT 1`,
    [systemEmail, systemPhone],
  );
  const systemUserUniqueId = systemRows[0]?.userUniqueId;
  if (!systemUserUniqueId) {
    logger.warn(
      "Queue sweep: seeded system user not found — sweep offers will be skipped",
    );
    return { message: "success", data: { offered: 0, advanced: [] } };
  }
  const sweepActor = { userUniqueId: systemUserUniqueId };

  const [pairs] = await executor.query(
    `SELECT DISTINCT dq.queueOrganizationUniqueId, v.vehicleTypeUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN QueueOrganization o ON o.queueOrganizationUniqueId = dq.queueOrganizationUniqueId
     WHERE dq.queueDate = ? AND dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT}) AND dq.queueDeletedAt IS NULL
       AND o.approvalStatus = 'approved' AND o.queueEnabled = 1 AND o.isDeleted = 0`,
    [queueDate],
  );

  const advanced = [];
  let offered = 0;
  for (const pair of pairs) {
    let guard = 0;
    while (guard++ < MAX_OFFERS_PER_SWEEP) {
      const res = await rescanPendingQueueOrder({
        queueOrganizationUniqueId: pair.queueOrganizationUniqueId,
        vehicleTypeUniqueId: pair.vehicleTypeUniqueId,
        user: sweepActor,
      });
      if (!res?.offered) break;
      offered += 1;
      advanced.push(res);
    }
  }

  if (offered > 0) {
    logger.info("Queue sweep matched pending orders", {
      offered,
      orgTypePairs: pairs.length,
    });
  }
  return { message: "success", data: { offered, advanced } };
};

module.exports.rescanPendingQueueOrder = rescanPendingQueueOrder;
