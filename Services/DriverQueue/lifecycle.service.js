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
  logQueueHistory,
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
  const [rows] = await executor.query(
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
  const [rows] = await executor.query(
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
 * BID-BASE orders with neither a linked entry nor a live own entry (offer was
 * surfaced by the creation/distance matcher while the driver was not in any
 * line) are a no-op — nothing to mark, so the shipper's accept is not blocked.
 */
exports.markEntryAgreed = async ({
  shipperRequestUniqueId,
  userUniqueId,
  bidOrder = false,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status,
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
  // driver was NOT in any line (or their line row is already terminal). There
  // is nothing to mark agreed — entry bookkeeping is a no-op so the shipper's
  // accept of the driver's bid is NOT blocked by a missing queue row.
  if (entry === null) {
    return { updated: false };
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
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.AGREED,
      agreedAt: currentDate(),
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
