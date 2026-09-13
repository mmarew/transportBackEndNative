"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createData } = require("../../CRUD/Create/CreateData");
const { emitQueueSnapshot } = require("../../Utils/QueueSocket");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { transactionStorage } = require("../../Utils/TransactionContext");
const {
  QUEUE_STATUS,
  HISTORY_EVENT,
  BATCH_DECLINED_JOURNEY_STATUSES,
  QUEUE_OFFER_WINDOW_MINUTES,
  queueOrgReady,
  logQueueHistory,
} = require("./helpers");
const {
  notifyDriverOfQueueOffer,
  notifyShipperOfQueueEvent,
} = require("./dispatch-notify");

/**
 * Terminalize a driver's active (requested) offer for the order currently
 * linked to the given queue entry — moves both the JourneyDecision and the
 * DriverRequest to a terminal cancelled-by-admin state (freeing the driver for
 * future offers) and clears the entry's order link. Used by removeEntry and
 * checkout to avoid leaving orphaned status-2 active journeys.
 */
const releaseRequestedOffer = async ({ executor, entry, user }) => {
  const now = currentDate();

  // Audit is captured by the caller (removeEntry) as a single `remove` snapshot
  // BEFORE this helper runs — the pre-image covers the shipperRequest clear too.

  // Terminalize any active DriverRequest + JourneyDecision for this driver and
  // the linked order. The driver may hold multiple historical offers, so we
  // match on the order currently linked AND a still-active (requested) status.
  await executor.query(
    `UPDATE JourneyDecisions jd
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     JOIN VehicleDriver vd ON vd.driverUserUniqueId = dr.userUniqueId
     SET jd.journeyStatusId = ?, jd.journeyDecisionUpdatedAt = ?,
         jd.journeyDecisionUpdatedBy = ?,
         jd.isCancellationByDriverSeenByShipper = 'no need to see it',
         dr.journeyStatusId = ?, dr.driverRequestUpdatedAt = ?,
         dr.driverRequestUpdatedBy = ?
     WHERE sr.shipperRequestUniqueId = ? AND dr.journeyStatusId IN (?, ?)
       AND vd.vehicleDriverUniqueId = ?`,
    [
      journeyStatusMap.cancelledByAdmin,
      now,
      user.userUniqueId,
      journeyStatusMap.cancelledByAdmin,
      now,
      user.userUniqueId,
      entry.shipperRequestUniqueId,
      journeyStatusMap.requested,
      journeyStatusMap.acceptedByShipper,
      entry.vehicleDriverUniqueId,
    ],
  );
};
const getShipperRequest = async (executor, shipperRequestUniqueId) => {
  const [rows] = await executor.query(
    `SELECT * FROM ShipperRequest
     WHERE shipperRequestUniqueId = ? AND shipperRequestDeletedAt IS NULL`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Shipper request not found", AppError.NOT_FOUND);
  }
  return rows[0];
};
const getDriverVehicle = async (executor, driverUserUniqueId) => {
  const [rows] = await executor.query(
    `SELECT v.vehicleUniqueId, v.licensePlate, v.color,
            vt.vehicleTypeName, vt.vehicleTypeUniqueId
     FROM Users u
     JOIN VehicleDriver vd ON vd.driverUserUniqueId = u.userUniqueId
       AND vd.assignmentStatus = 'active' AND vd.vehicleDriverDeletedAt IS NULL
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
     WHERE u.userUniqueId = ? LIMIT 1`,
    [driverUserUniqueId],
  );
  return rows[0] || null;
};
/**
 * Ensure the driver has a `DriverRequest` in `waiting` that can receive a new
 * JourneyDecision. `JourneyDecisions.driverRequestId` is UNIQUE — one decision
 * per driver request — so we reuse only a waiting request that has never been
 * linked to a decision, and create a fresh one otherwise (falling back to the
 * queue organization's site as the origin placeholder).
 *
 * Returns `null` when the driver is already holding an active offer elsewhere
 * (their latest request is `requested`) — the caller skips to the next driver.
 */
const ensureWaitingDriverRequest = async (
  executor,
  driverUserUniqueId,
  queueOrganizationUniqueId,
) => {
  // The unique index `uq_driver_active_request` means at most ONE non-terminal
  // request exists per driver (activeRequestGuard = 1 for statuses 1-5). Branch
  // on what that request is:
  //   - no decision attached  → a reusable `waiting` request → return it
  //   - `waiting` + decision   → stale leftover from the expired-offer release
  //                              fix → fall through to release + fresh insert
  //   - requested/accepted/… + decision → a REAL pending offer or in-flight
  //                              journey → return null so the caller advances
  //                              to the next waiting driver (never a second
  //                              order while the driver holds an active one).
  const [activeRows] = await executor.query(
    `SELECT dr.driverRequestId, dr.driverRequestUniqueId, dr.journeyStatusId,
            jd.driverRequestId AS decisionDriverRequestId
     FROM DriverRequest dr
     LEFT JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
     WHERE dr.userUniqueId = ? AND dr.activeRequestGuard = 1
       AND dr.driverRequestDeletedAt IS NULL
     ORDER BY dr.driverRequestId DESC LIMIT 1`,
    [driverUserUniqueId],
  );
  if (activeRows.length > 0) {
    const latest = activeRows[0];
    if (latest.decisionDriverRequestId === null) {
      return {
        driverRequestId: latest.driverRequestId,
        driverRequestUniqueId: latest.driverRequestUniqueId,
      };
    }
    if (latest.journeyStatusId !== journeyStatusMap.waiting) {
      return null;
    }
  }

  const [rows] = await executor.query(
    `SELECT dr.driverRequestId, dr.driverRequestUniqueId
     FROM DriverRequest dr
     LEFT JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
     WHERE dr.userUniqueId = ? AND dr.journeyStatusId = ?
       AND dr.driverRequestDeletedAt IS NULL
       AND jd.driverRequestId IS NULL
     ORDER BY dr.driverRequestId DESC LIMIT 1`,
    [driverUserUniqueId, journeyStatusMap.waiting],
  );
  if (rows.length > 0) {
    return rows[0];
  }

  // Leftover state from before the expired-offer release fix: a `waiting`
  // DriverRequest that already has a JourneyDecision attached. It can't be
  // reused (JourneyDecisions.driverRequestId is UNIQUE) and the active-request
  // unique index blocks inserting a fresh one, so every offer for this driver
  // died with ER_DUP_ENTRY. Release it to a terminal status first, then create
  // a clean waiting request below.
  const [staleRows] = await executor.query(
    `SELECT dr.driverRequestId
     FROM DriverRequest dr
     JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
     WHERE dr.userUniqueId = ? AND dr.journeyStatusId = ?
       AND dr.driverRequestDeletedAt IS NULL
     ORDER BY dr.driverRequestId DESC LIMIT 1`,
    [driverUserUniqueId, journeyStatusMap.waiting],
  );
  if (staleRows.length > 0) {
    await updateData({
      tableName: "DriverRequest",
      updateValues: {
        journeyStatusId: journeyStatusMap.rejectedByDriver,
        driverRequestUpdatedAt: currentDate(),
      },
      conditions: { driverRequestId: staleRows[0].driverRequestId },
    });
  }

  const [orgRows] = await executor.query(
    `SELECT queueOrganizationName, latitude, longitude
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  const org = orgRows[0] || {};
  const driverRequestUniqueId = uuidv4();
  const inserted = await createData({
    tableName: "DriverRequest",
    insertValues: {
      driverRequestUniqueId,
      userUniqueId: driverUserUniqueId,
      originLatitude: org.latitude ?? 0,
      originLongitude: org.longitude ?? 0,
      originPlace: org.queueOrganizationName || "Queue organization",
      journeyStatusId: journeyStatusMap.waiting,
      driverRequestCreatedAt: currentDate(),
    },
  });
  return { driverRequestId: inserted.insertId, driverRequestUniqueId };
};
/**
 * The engine-level offer: create a `JourneyDecision` (requested, decisionBy =
 * shipper) linking the order to the driver's request, and move the order +
 * driver request into `requested` so the existing accept/reject/timeout engine
 * takes over from here.
 */
const createQueueOffer = async (
  executor,
  { shipperRequest, driverRequest, user },
) => {
  const journeyDecisionUniqueId = uuidv4();
  const now = currentDate();
  await createData({
    tableName: "JourneyDecisions",
    insertValues: {
      journeyDecisionUniqueId,
      shipperRequestId: shipperRequest.shipperRequestId,
      driverRequestId: driverRequest.driverRequestId,
      journeyStatusId: journeyStatusMap.requested,
      decisionTime: now,
      decisionBy: "queue",
      journeyDecisionCreatedBy: user.userUniqueId,
      journeyDecisionCreatedAt: now,
    },
  });
  await updateData({
    tableName: "ShipperRequest",
    updateValues: {
      journeyStatusId: journeyStatusMap.requested,
      shipperRequestUpdatedAt: now,
      shipperRequestUpdatedBy: user.userUniqueId,
    },
    conditions: { shipperRequestId: shipperRequest.shipperRequestId },
  });
  await updateData({
    tableName: "DriverRequest",
    updateValues: {
      journeyStatusId: journeyStatusMap.requested,
      driverRequestUpdatedAt: now,
      driverRequestUpdatedBy: user.userUniqueId,
    },
    conditions: { driverRequestId: driverRequest.driverRequestId },
  });
  return {
    journeyDecisionUniqueId,
    decision: {
      journeyDecisionUniqueId,
      shipperRequestId: shipperRequest.shipperRequestId,
      driverRequestId: driverRequest.driverRequestId,
      driverRequestUniqueId: driverRequest.driverRequestUniqueId,
      journeyStatusId: journeyStatusMap.requested,
      decisionTime: now,
      decisionBy: "queue",
    },
  };
};
/**
 * Core offer primitive — mark a queue driver as having `requested` an order,
 * link the order, create the JourneyDecision, and notify only that driver over
 * socket.
 *
 * ### Reservation priority (shipper's right)
 *
 * A driver can reserve their queue position for ONE shipper at check-in
 * (`shipperPhoneNumber` → `targetedShipperUserUUID`). That reservation is
 * exclusive — it is never a hint — and this function enforces both halves:
 *
 * - **WHY (#1 — protect):** a driver reserved for shipper X must never be
 *   offered to shipper Y's order. Without this, another shipper's orders could
 *   queue-jump ahead of the reserving shipper by consuming their targeted
 *   drivers ("stealing" the reservation).
 * - **WHY (#2 — redirect):** shipper X's OWN orders must reach their reserved
 *   drivers FIRST, even when general (unreserved) drivers sit ahead of them by
 *   queue position. The reservation is the shipper's right to their fleet.
 *
 * - **HOW (#1):** the FIFO scan adds
 *   `(dq.targetedShipperUserUUID IS NULL OR dq.targetedShipperUserUUID = ?)`,
 *   so drivers reserved for a DIFFERENT shipper never enter the candidate set —
 *   they are excluded by the WHERE clause, not skipped per-row. Targeted mode
 *   dispatch (2/3) additionally throws `400 "Driver is reserved for a different
 *   shipper"` so an admin can never reassign a reserved driver by hand either.
 * - **HOW (#2):** the FIFO scan orders candidates
 *   `CASE WHEN dq.targetedShipperUserUUID = ? THEN 0 ELSE 1 END, dq.queueNumber ASC`
 *   — the reserving shipper's drivers are offered before all general drivers,
 *   each group by queueNumber. When no reserved driver remains (all busy, all
 *   refused, or none checked in), the order falls through to general FIFO.
 * - **HOW (advance):** because the priority above reorders candidates by
 *   reservation FIRST, the old advance mechanism (a `queueNumber > ?` cursor)
 *   became unsafe — after a high-position reserved driver rejected, that cursor
 *   would also drop lower-numbered general drivers that were still eligible.
 *   Skipped drivers are therefore excluded by **driver id** (NOT IN on
 *   `vehicleDriverUniqueId`) instead of by queue position.
 *
 * - **WHEN:** every FIFO offer — order-creation auto-dispatch
 *   (handleQueueDispatch), check-in rescan (rescanPendingQueueOrder), and every
 *   advance after reject / timeout / cancel / expiry (offerToNextDriver paths).
 *   Targeted dispatch (2/3) is NOT re-prioritized; a named driver is honored
 *   only if they are not reserved for a different shipper.
 *
 * - **WHO:** requirement specified by the project owner (the reserving shipper
 *   has full right to their targeted drivers); implemented in the `offerToDriver`
 *   selection rework. Behavior is testable as TQ-14A / TQ-14B / TQ-14C in
 *   `docs/testing/queue-process-test-plan.md`.
 *
 * The driver is selected in ONE of three ways:
 *   1. FIFO (default): the FRONT waiting driver of the order's vehicle type.
 *      Drivers reserved for a DIFFERENT shipper than this order's creator are
 *      never considered; drivers this shipper reserved (`targetedShipperUserUUID`
 *      = the order creator) are offered BEFORE general (unreserved) drivers.
 *      `excludeVehicleDriverUniqueId` skips a specific driver.
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
 * BATCH-REFUSAL RULE (FIFO scans only): when the order belongs to a batch
 * (`shipperRequest.shipperRequestBatchUniqueId`), a driver who declined ANY
 * order of that batch ("said no" statuses — see
 * BATCH_DECLINED_JOURNEY_STATUSES) is also skipped, so one decline cools the
 * whole batch. Targeted dispatch (mode 2/3) is EXEMPT and can reconnect the
 * batch to a cooled driver on purpose.
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
 * @param {string} [params.excludeVehicleDriverUniqueId] - FIFO: skip this driver.
 *   Seeds the driver-id exclusion set (replaces the legacy queueNumber cursor).
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

  // Excluded-driver set — WHY/HOW: drivers once skipped mid-scan (reserved for
  // a different shipper, or with no active DriverRequest) are excluded by their
  // driver id (NOT IN) instead of by a `queueNumber > ?` cursor. Reservation
  // priority reorders candidates by (matched reservation, queueNumber), so the
  // old cursor would have also dropped lower-numbered GENERAL drivers after a
  // high-position reserved driver was passed; an id-based set lets the scan fall
  // through to general drivers once the reserved fleet is exhausted.
  // `excludeVehicleDriverUniqueId` (advance/reject/timeout/cancel) seeds it; the
  // `NOT EXISTS` on JourneyDecisions makes refusal exclusion redundant but kept
  // as the authoritative guard.
  const excludedVehicleDriverUniqueIds = new Set();
  if (excludeVehicleDriverUniqueId) {
    excludedVehicleDriverUniqueIds.add(excludeVehicleDriverUniqueId);
  }

  while (true) {
    /**
     * Find the front waiting driver for a vehicle type in a queue org.
     * Joins: DriverQueue → VehicleDriver → Vehicle (for vehicleTypeUniqueId filter)
     *        → Users (for driver phone/name in socket notification).
     * Uses FOR UPDATE to lock the row while we create the offer, preventing
     * concurrent dispatches from offering the same driver twice.
     * In FIFO mode the scan reaches THIS shipper's reserved drivers first
     * (targetedShipperUserUUID = order creator), then general (unreserved)
     * drivers, and never drivers reserved for a DIFFERENT shipper.
     */
    const whereParts = [
      `dq.queueOrganizationUniqueId = ?`,
      `dq.queueDate = ?`,
      isTargeted
        ? `(dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT}) OR (dq.status = ${QUEUE_STATUS.REQUESTED} AND dq.shipperRequestUniqueId = ?))`
        : `dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT})`,
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
    if (!isTargeted) {
      // Requirement 1 (shipper's right, protect): never even SELECT drivers
      // reserved for a DIFFERENT shipper than this order's creator — the
      // reservation is exclusive, so "stealing" by SQL is impossible.
      whereParts.push(
        `(dq.targetedShipperUserUUID IS NULL OR dq.targetedShipperUserUUID = ?)`,
      );
      queryParams.push(shipperRequest.userUniqueId);
    }
    if (targetQueueUniqueId) {
      whereParts.push(`dq.queueUniqueId = ?`);
      queryParams.push(targetQueueUniqueId);
    }
    if (targetVehicleDriverUniqueId) {
      whereParts.push(`dq.vehicleDriverUniqueId = ?`);
      queryParams.push(targetVehicleDriverUniqueId);
    }
    if (excludedVehicleDriverUniqueIds.size > 0) {
      whereParts.push(
        `dq.vehicleDriverUniqueId NOT IN (${Array.from(
          excludedVehicleDriverUniqueIds,
        )
          .map(() => "?")
          .join(", ")})`,
      );
      queryParams.push(...excludedVehicleDriverUniqueIds);
    }
    whereParts.push(`NOT EXISTS (
           SELECT 1 FROM JourneyDecisions jd
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE jd.shipperRequestId = ?
             AND dr.userUniqueId = vd.driverUserUniqueId
             AND jd.journeyStatusId IN (?, ?, ?, ?)
         )`);
    queryParams.push(...skipRejectedParams);

    // BATCH-REFUSAL RULE — automatic FIFO scans only. A driver who declined ANY
    // order of THIS order's batch (a JourneyDecision on any non-deleted order
    // sharing shipperRequestBatchUniqueId with a "said no" status) is skipped,
    // so one decline cools every job of the batch. Targeted manual dispatch
    // (targetQueueUniqueId / targetVehicleDriverUniqueId) is EXEMPT — an admin
    // can always reconnect a driver to a batch order. Orders without a batch
    // (NULL) or with a different batch id never match.
    if (!isTargeted && shipperRequest.shipperRequestBatchUniqueId) {
      whereParts.push(`NOT EXISTS (
           SELECT 1 FROM JourneyDecisions jd2
           JOIN DriverRequest dr2 ON dr2.driverRequestId = jd2.driverRequestId
           JOIN ShipperRequest sr2 ON sr2.shipperRequestId = jd2.shipperRequestId
           WHERE sr2.shipperRequestBatchUniqueId = ?
             AND sr2.shipperRequestDeletedAt IS NULL
             AND dr2.userUniqueId = vd.driverUserUniqueId
             AND jd2.journeyStatusId IN (?, ?, ?)
         )`);
      queryParams.push(
        shipperRequest.shipperRequestBatchUniqueId,
        ...BATCH_DECLINED_JOURNEY_STATUSES,
      );
    }

    // Requirement 2 (shipper's right, redirect): offer THIS shipper's reserved
    // drivers first, then general (unreserved) drivers, each group by
    // queueNumber ASC, so a shipper's targeted fleet always outranks general
    // drivers regardless of queue position. The ORDER BY placeholder reuses the
    // order creator's userUniqueId and is appended after all WHERE params.
    const orderByClause = isTargeted
      ? `dq.queueNumber ASC`
      : `CASE WHEN dq.targetedShipperUserUUID = ? THEN 0 ELSE 1 END, dq.queueNumber ASC`;
    if (!isTargeted) {
      queryParams.push(shipperRequest.userUniqueId);
    }

    const [front] = await txExecutor.query(
      `SELECT dq.*, vd.driverUserUniqueId, u.phoneNumber, u.fullName
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       WHERE ${whereParts.join(" AND ")}
       ORDER BY ${orderByClause} LIMIT 1
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
    // because the WHERE clause only admits REQUESTED rows in targeted mode.
    if (isTargeted && entry.status === QUEUE_STATUS.REQUESTED) {
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
            status: QUEUE_STATUS.REQUESTED,
          },
        };
      }
    }

    // EXCLUSIVE RESERVATION: if this driver targeted a specific shipper via
    // phone at check-in, only offer them orders from that shipper. In FIFO the
    // WHERE clause already excludes drivers reserved for a different shipper;
    // this guard remains as a safety net (and enforces the 400 in targeted mode).
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
      excludedVehicleDriverUniqueIds.add(entry.vehicleDriverUniqueId);
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
      excludedVehicleDriverUniqueIds.add(entry.vehicleDriverUniqueId);
      continue;
    }

    // NO-ANSWER RETENTION RELEASE: an order surviving its offer window can be
    // sitting on a `no_answer_from_driver` entry (16, order still attached —
    // the timeout sweep keeps it there so the first driver's late accept is
    // still honoured). Now that we have found a CONCRETE next driver for this
    // order, that retention must be released BEFORE the new offer is created
    // (otherwise the same order ends up linked to two entries). The released
    // holder keeps their line position (18) and stays in queue; the late-accept
    // gate on markEntryAgreed then rejects the first driver with "order passed
    // to another driver". Locks the stale holder row so concurrent advance +
    // late-accept serialize.
    const [staleHolders] = await txExecutor.query(
      `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate
       FROM DriverQueue
       WHERE shipperRequestUniqueId = ? AND status = ${QUEUE_STATUS.NO_ANSWER_FROM_DRIVER}
         AND queueDeletedAt IS NULL AND queueId <> ?
       FOR UPDATE`,
      [shipperRequestUniqueId, entry.queueId],
    );
    for (const stale of staleHolders) {
      await logQueueHistory(txExecutor, {
        queueUniqueId: stale.queueUniqueId,
        event: HISTORY_EVENT.ADVANCE_RELEASE,
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
        conditions: { queueId: stale.queueId },
      });
      await emitQueueSnapshot({
        queueOrganizationUniqueId: stale.queueOrganizationUniqueId,
        queueDate: stale.queueDate,
      });
    }

    const offerResult = await createQueueOffer(txExecutor, {
      shipperRequest,
      driverRequest,
      user,
    });

    await logQueueHistory(txExecutor, {
      queueUniqueId: entry.queueUniqueId,
      event: HISTORY_EVENT.OFFER,
      performedBy: user.userUniqueId,
    });

    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: QUEUE_STATUS.REQUESTED,
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
        status: QUEUE_STATUS.REQUESTED,
      },
    };
  }
};

module.exports = {
  getShipperRequest,
  getDriverVehicle,
  ensureWaitingDriverRequest,
  createQueueOffer,
  releaseRequestedOffer,
  offerToDriver,
};
