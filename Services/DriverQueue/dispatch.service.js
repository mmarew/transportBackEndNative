"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createData } = require("../../CRUD/Create/CreateData");
const { emitQueueSnapshot, notifyQueueOrgAdmins } = require("../../Utils/QueueSocket");
const { sendSocketIONotificationToDriver, sendSocketIONotificationToShipper } = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSms } = require("../../Utils/smsSender");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
const { transactionStorage } = require("../../Utils/TransactionContext");
const {
  today, queueOrgReady, logQueueHistory,
  QUEUE_OFFER_WINDOW_MINUTES, MAX_OFFERS_PER_SWEEP,
} = require("./helpers");
const {
  getShipperRequest, getDriverVehicle, ensureWaitingDriverRequest,
  createQueueOffer, notifyDriverOfQueueOffer, notifyShipperOfQueueEvent,
  notifyShipperOfQueueReservation,
} = require("./dispatch-notify");

/**
 * Core offer primitive — mark a queue driver as having `requested` an order,
 * link the order, create the JourneyDecision, and notify only that driver over
 * socket.
 *
 * The driver is selected in ONE of three ways:
 *   1. FIFO (default): the FRONT waiting driver of the order's vehicle type
 *      (`afterQueueNumber`/`excludeVehicleDriverUniqueId` steer the scan).
 *   2. By queue entry: `targetQueueUniqueId` pinpoints a specific entry.
 *   3. By driver: `targetVehicleDriverUniqueId` pinpoints a specific driver's
 *      active vehicle assignment.
 *
 * Drivers already holding an active offer elsewhere, or who already refused /
 * cancelled / had admin-cancelled THIS exact order, are never re-offered it.
 * In FIFO mode they are skipped past (advancing to the next waiting driver); in
 * targeted mode (2 or 3) the dispatch throws a 4xx explaining why the named
 * driver could not take the order.
 *
 * With `throwIfNone` (manual dispatch) an empty queue is a 404; with the auto
 * path (handleQueueDispatch / advance) an empty queue just means the order
 * stays waiting — the call returns `{ offered: false }` instead.
 *
 * @param {Object} params
 * @param {Object} params.executor - DB executor (query-capable connection/pool).
 * @param {string} params.queueOrganizationUniqueId - The queue org UUID.
 * @param {string} params.queueDate - Queue date (YYYY-MM-DD) the entry must belong to.
 * @param {string} [params.vehicleTypeUniqueId] - Vehicle type of the order. Falls
 *   back to the order's own vehicleTypeUniqueId when omitted (targeted dispatch).
 * @param {string} params.shipperRequestUniqueId - The order to offer.
 * @param {number} [params.afterQueueNumber] - FIFO: only consider entries with
 *   a queueNumber greater than this (used by reject/advance/timeout).
 * @param {string} [params.excludeVehicleDriverUniqueId] - FIFO: skip this driver.
 * @param {string} [params.targetQueueUniqueId] - Target a SPECIFIC queue entry.
 * @param {string} [params.targetVehicleDriverUniqueId] - Target a SPECIFIC
 *   driver (their active vehicle assignment UUID).
 * @param {Object} params.user - The acting admin (userUniqueId recorded as performer).
 * @param {boolean} [params.throwIfNone=true] - true → 404 when no driver is
 *   eligible; false → return `{ offered: false }`.
 * @returns {Promise<{offered: true, data: Object}|{offered: false, data: null}>}
 * @throws {AppError} 404 when no eligible driver (throwIfNone) or targeted entry/driver gone.
 * @throws {AppError} 400 when a targeted driver is reserved for another shipper
 *   or has no active DriverRequest record.
 */
const offerToDriver = async ({
  executor,
  queueOrganizationUniqueId,
  queueDate,
  vehicleTypeUniqueId,
  shipperRequestUniqueId,
  afterQueueNumber,
  excludeVehicleDriverUniqueId,
  targetQueueUniqueId,
  targetVehicleDriverUniqueId,
  user,
  throwIfNone = true,
}) => {
  await queueOrgReady(executor, queueOrganizationUniqueId);
  const shipperRequest = await getShipperRequest(
    executor,
    shipperRequestUniqueId,
  );

  // Targeted dispatch identifies the driver by queue entry (or vehicle
  // assignment); when no vehicle type is passed we take it from the order and
  // the target entry/driver must still match that type.
  const isTargeted = !!(targetQueueUniqueId || targetVehicleDriverUniqueId);
  const matchedTypeUniqueId =
    vehicleTypeUniqueId || shipperRequest.vehicleTypeUniqueId;

  // Use the active transaction connection when one exists (dispatch wraps this
  // call in executeInTransaction so the FOR UPDATE lock is held across the
  // select + offer, preventing concurrent dispatches from double-offering the
  // same driver). Falls back to the caller-provided executor.
  const txExecutor = transactionStorage.getStore() || executor;

  // Drivers who have already rejected (or cancelled, or had admin-cancelled)
  // THIS exact order are never re-offered it — the order advances past them to
  // the next waiting driver, or stays waiting when the whole queue has refused.
  const skipRejectedParams = [
    shipperRequest.shipperRequestId,
    journeyStatusMap.cancelledByDriver,
    journeyStatusMap.rejectedByShipper,
    journeyStatusMap.rejectedByDriver,
    journeyStatusMap.cancelledByAdmin,
  ];

  let after = afterQueueNumber || null;
  while (true) {
    /**
     * Find the front waiting driver for a vehicle type in a queue org.
     * Joins: DriverQueue → VehicleDriver → Vehicle (for vehicleTypeUniqueId filter)
     *        → Users (for driver phone/name in socket notification).
     * Uses FOR UPDATE to lock the row while we create the offer, preventing
     * concurrent dispatches from offering the same driver twice.
     * If `afterQueueNumber` is provided, skips drivers up to that position
     * (used by advance/reject/timeout to move to the next driver).
     */
    const whereParts = [
      `dq.queueOrganizationUniqueId = ?`,
      `dq.queueDate = ?`,
      isTargeted
        ? `(dq.status IN ('waiting', 'notagreed') OR (dq.status = 'requested' AND dq.shipperRequestUniqueId = ?))`
        : `dq.status IN ('waiting', 'notagreed')`,
      `dq.queueDeletedAt IS NULL`,
      `v.vehicleTypeUniqueId = ?`,
    ];
    const queryParams = [
      queueOrganizationUniqueId,
      queueDate,
      matchedTypeUniqueId,
    ];
    if (isTargeted) {
      queryParams.splice(2, 0, shipperRequestUniqueId);
    }
    if (after) {
      whereParts.push(`dq.queueNumber > ?`);
      queryParams.push(after);
    }
    if (targetQueueUniqueId) {
      whereParts.push(`dq.queueUniqueId = ?`);
      queryParams.push(targetQueueUniqueId);
    }
    if (targetVehicleDriverUniqueId) {
      whereParts.push(`dq.vehicleDriverUniqueId = ?`);
      queryParams.push(targetVehicleDriverUniqueId);
    }
    if (excludeVehicleDriverUniqueId) {
      whereParts.push(`dq.vehicleDriverUniqueId <> ?`);
      queryParams.push(excludeVehicleDriverUniqueId);
    }
    whereParts.push(`NOT EXISTS (
           SELECT 1 FROM JourneyDecisions jd
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE jd.shipperRequestId = ?
             AND dr.userUniqueId = vd.driverUserUniqueId
             AND jd.journeyStatusId IN (?, ?, ?, ?)
         )`);
    queryParams.push(...skipRejectedParams);

    const [front] = await txExecutor.query(
      `SELECT dq.*, vd.driverUserUniqueId, u.phoneNumber, u.fullName
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       WHERE ${whereParts.join(" AND ")}
       ORDER BY dq.queueNumber ASC LIMIT 1
       FOR UPDATE`,
      queryParams,
    );

    if (front.length === 0) {
      if (isTargeted) {
        throw new AppError(
          "Targeted driver/entry not found or not dispatchable",
          AppError.NOT_FOUND,
        );
      }
      if (throwIfNone) {
        throw new AppError(
          "No waiting driver in this vehicle type's queue",
          AppError.NOT_FOUND,
        );
      }
      return { offered: false, data: null };
    }

    const entry = front[0];

    // IDEMPOTENT TARGETED RE-SELECT: when the targeted entry was already
    // requested for THIS exact order (typically because the order-create
    // auto-dispatch already offered it FIFO), a manual dispatch naming the
    // same entry is a no-op success — no second DriverRequest/JourneyDecision
    // is created. Non-targeted (FIFO) dispatch never reaches this branch
    // because the WHERE clause only admits 'requested' rows in targeted mode.
    if (isTargeted && entry.status === "requested") {
      const [existingDecisions] = await txExecutor.query(
        `SELECT jd.journeyDecisionUniqueId
         FROM JourneyDecisions jd
         JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
         WHERE jd.shipperRequestId = ?
           AND dr.userUniqueId = ?
           AND jd.journeyStatusId = ?
         ORDER BY jd.journeyDecisionId DESC LIMIT 1`,
        [
          shipperRequest.shipperRequestId,
          entry.driverUserUniqueId,
          journeyStatusMap.requested,
        ],
      );
      const existingDecision = existingDecisions[0] || null;
      if (existingDecision) {
        return {
          offered: true,
          data: {
            queueUniqueId: entry.queueUniqueId,
            queueNumber: entry.queueNumber,
            driverUserUniqueId: entry.driverUserUniqueId,
            journeyDecisionUniqueId: existingDecision.journeyDecisionUniqueId,
            status: "requested",
          },
        };
      }
    }

    // EXCLUSIVE RESERVATION: if this driver targeted a specific shipper via
    // phone at check-in, only offer them orders from that shipper. Skip to
    // the next driver in FIFO otherwise.
    if (
      entry.targetedShipperUserUUID &&
      shipperRequest.userUniqueId !== entry.targetedShipperUserUUID
    ) {
      if (isTargeted) {
        throw new AppError(
          "Driver is reserved for a different shipper",
          AppError.BAD_REQUEST,
        );
      }
      after = entry.queueNumber;
      continue;
    }

    const driverRequest = await ensureWaitingDriverRequest(
      txExecutor,
      entry.driverUserUniqueId,
      queueOrganizationUniqueId,
    );
    if (!driverRequest) {
      if (isTargeted) {
        throw new AppError(
          "Driver has no active DriverRequest record",
          AppError.BAD_REQUEST,
        );
      }
      after = entry.queueNumber;
      continue;
    }

    const offerResult = await createQueueOffer(txExecutor, {
      shipperRequest,
      driverRequest,
      user,
    });

    await logQueueHistory(txExecutor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "status",
      oldValue: entry.status,
      newValue: "requested",
      performedBy: user.userUniqueId,
    });
    await logQueueHistory(txExecutor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "shipperRequestUniqueId",
      oldValue: entry.shipperRequestUniqueId,
      newValue: shipperRequestUniqueId,
      performedBy: user.userUniqueId,
    });

    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "requested",
        requestedAt: currentDate(),
        shipperRequestUniqueId,
        queueUpdatedAt: currentDate(),
        queueUpdatedBy: user.userUniqueId,
      },
      conditions: { queueId: entry.queueId },
    });

    await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });

    const vehicle = await getDriverVehicle(
      txExecutor,
      entry.driverUserUniqueId,
    );
    await notifyDriverOfQueueOffer({
      front: entry,
      shipperRequest,
      vehicle,
      offerResult,
    });
    await notifyShipperOfQueueEvent({
      executor,
      shipperRequestUniqueId,
      messageType: "queue_order_offered",
      message: "New queue order offered to a driver",
      data: {
        driver: {
          driver: {
            ...entry,
            driverRequestUniqueId: offerResult.decision.driverRequestUniqueId,
          },
          vehicle,
        },
        decisions: offerResult.decision,
        queue: {
          queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
          queueUniqueId: entry.queueUniqueId,
          queueNumber: entry.queueNumber,
          offerWindowMinutes: QUEUE_OFFER_WINDOW_MINUTES,
        },
      },
    });

    return {
      offered: true,
      data: {
        queueUniqueId: entry.queueUniqueId,
        queueNumber: entry.queueNumber,
        driverUserUniqueId: entry.driverUserUniqueId,
        journeyDecisionUniqueId: offerResult.journeyDecisionUniqueId,
        status: "requested",
      },
    };
  }
};


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
 *   queueNumber, driverUserUniqueId, journeyDecisionUniqueId, status: "requested" } }`.
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
        afterQueueNumber: null,
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
        afterQueueNumber: null,
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
           AND dq.status = 'requested'
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
      afterQueueNumber: null,
      user,
      throwIfNone: false,
    });
    if (result?.offered) {
      return result;
    }
  }
  return { offered: false, data: null };
};

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
  // "system" user. A fake id makes every sweep offer die on the foreign key
  // and roll back.
  const [systemRows] = await executor.query(
    `SELECT userUniqueId FROM Users
     WHERE email = 'system@system.com' OR phoneNumber = '+251922112480'
     LIMIT 1`,
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
     WHERE dq.queueDate = ? AND dq.status IN ('waiting', 'notagreed') AND dq.queueDeletedAt IS NULL
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


/**
 * Advance the offer — offer the order to the NEXT waiting driver in line
 * (strictly after `afterQueueNumber`). Used when the front driver rejects or
 * times out: the driver keeps their position (`waiting`), the ORDER advances.
 * Returns `{ offered: false }` when no further driver of that type is waiting.
 */
const offerToNextDriver = ({
  executor,
  queueOrganizationUniqueId,
  queueDate,
  vehicleTypeUniqueId,
  afterQueueNumber,
  excludeVehicleDriverUniqueId,
  shipperRequestUniqueId,
  user,
}) =>
  offerToDriver({
    executor,
    queueOrganizationUniqueId,
    queueDate,
    vehicleTypeUniqueId,
    shipperRequestUniqueId,
    afterQueueNumber,
    excludeVehicleDriverUniqueId,
    user,
    throwIfNone: false,
  });



module.exports = exports;
module.exports.notifyShipperOfQueueReservation = notifyShipperOfQueueReservation;
module.exports.rescanPendingQueueOrder = rescanPendingQueueOrder;
module.exports.offerToNextDriver = offerToNextDriver;
