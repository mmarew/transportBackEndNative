"use strict";

const { currentDate } = require("../../Utils/CurrentDate");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const {
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
} = require("../../Utils/QueueSocket");
const { sendSocketIONotificationToDriver } = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const {
  QUEUE_STATUS,
  HISTORY_EVENT,
  QUEUE_REFUSAL_LIMIT,
  logQueueHistory,
  nextQueueNumber,
  terminalizeQueueOrderRequest,
} = require("./helpers");
const { offerToDriver } = require("./dispatch-offer.service");
const { notifyShipperOfQueueEvent } = require("./dispatch-notify");

// DriverQueue.statuses that mean the order is still actively bound to an entry.
// Terminal/kept-position entries (12, 18, 9, ...) are never "holders".
const HOLDING_QUEUE_STATUSES = [
  QUEUE_STATUS.REQUESTED,
  QUEUE_STATUS.AGREED,
  QUEUE_STATUS.GO_TO_LOADING_PLACE,
  QUEUE_STATUS.LOADING,
  QUEUE_STATUS.LOADED,
  QUEUE_STATUS.JOURNEY_STARTED,
  QUEUE_STATUS.NO_ANSWER_FROM_DRIVER,
];
/**
 * After an order's last holder entry is released (reject / cancel / advance) and
 * no next driver was found, revert the ORDER to `waiting` so it no longer
 * appears "requested/driver found" while nobody holds it. Guarded: never reverts
 * while any LIVE entry still carries the order (e.g. a no-answer retention entry
 * still waiting for its first driver's late accept). Idempotent.
 */
const resetOrderToWaitingIfUnheld = async ({
  executor,
  shipperRequestUniqueId,
  user,
}) => {
  const [held] = await executor.query(
    `SELECT dq.queueId
     FROM DriverQueue dq
     WHERE dq.shipperRequestUniqueId = ?
       AND dq.queueDeletedAt IS NULL
       AND dq.status IN (?, ?, ?, ?, ?, ?, ?)
     LIMIT 1`,
    [shipperRequestUniqueId, ...HOLDING_QUEUE_STATUSES],
  );
  if (held.length > 0) return { reverted: false, held: true };
  const now = currentDate();
  await updateData({
    tableName: "ShipperRequest",
    updateValues: {
      journeyStatusId: journeyStatusMap.waiting,
      shipperRequestUpdatedAt: now,
      ...(user?.userUniqueId
        ? { shipperRequestUpdatedBy: user.userUniqueId }
        : {}),
    },
    conditions: { shipperRequestUniqueId },
  });
  return { reverted: true };
};
const offerToNextDriver = async ({
  executor,
  queueOrganizationUniqueId,
  queueDate,
  vehicleTypeUniqueId,
  excludeVehicleDriverUniqueId,
  shipperRequestUniqueId,
  user,
}) => {
  const result = await offerToDriver({
    executor,
    queueOrganizationUniqueId,
    queueDate,
    vehicleTypeUniqueId,
    shipperRequestUniqueId,
    excludeVehicleDriverUniqueId,
    user,
    throwIfNone: false,
  });
  if (result.offered === false) {
    // No next driver could take the order — it has no live holder anymore, so
    // drop it back to `waiting` (pending dispatch) instead of leaving it
    // `requested` with no driver attached.
    await resetOrderToWaitingIfUnheld({
      executor,
      shipperRequestUniqueId,
      user,
    });
  }
  return result;
};
/**
 * Queue-dispatch cancel AFTER the driver accepted the order (cancelledByDriver):
 * the entry holding the order (agreed / loading-stages / journey-started) is
 * closed as `cancelled_after_accept` (12, same closure as checkout/leave), so
 * the driver forfeits the queued slot entirely and must re-register for the
 * next placement. One penalty point is counted toward the driver's refusal
 * limit (applyRefusalPolicy). The ORDER is immediately offered to the NEXT
 * waiting driver of the same vehicle type (offerToNextDriver); when no further
 * driver is available, the queue org admins and the shipper are notified.
 * No-op / `{ released: false }` for non-queue orders or when the entry is
 * already released. Idempotent.
 */
exports.releaseQueueEntryAfterDriverCancel = async ({
  shipperRequestUniqueId,
  user,
}) => {
  const executor = db();

  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.queueRefusalCount, dq.vehicleDriverUniqueId, vd.driverUserUniqueId, v.vehicleTypeUniqueId,
            dq.status
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status IN (
       ${QUEUE_STATUS.AGREED},
       ${QUEUE_STATUS.GO_TO_LOADING_PLACE},
       ${QUEUE_STATUS.LOADING},
       ${QUEUE_STATUS.LOADED},
       ${QUEUE_STATUS.JOURNEY_STARTED}
     )
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC LIMIT 1
     FOR UPDATE`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { message: "success", released: false, offered: false, data: null };
  }

  const entry = rows[0];
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.DRIVER_CANCEL_AFTER_ACCEPT,
    performedBy: user.userUniqueId,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.CANCELLED_AFTER_ACCEPT,
      requestedAt: null,
      shipperRequestUniqueId: null,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
      queueDeletedAt: currentDate(),
      queueDeletedBy: user.userUniqueId,
    },
    conditions: { queueId: entry.queueId },
  });

  // Penalty: the backed-out commitment counts as a refusal toward the limit.
  await applyRefusalPolicy({ executor, entry, user });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    messageType: "queue_order_cancelled",
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
    // No further waiting driver of this vehicle type: notify the org admins
    // and the shipper instead of leaving the order silently unreserved.
    notifyQueueOrgAdmins({
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      messageType: "online_driver_not_found",
      message: {
        shipperRequestUniqueId,
        queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
        queueUniqueId: entry.queueUniqueId,
      },
    });
    await notifyShipperOfQueueEvent({
      executor,
      shipperRequestUniqueId,
      messageType: "online_driver_not_found",
      message:
        "Driver cancelled after accepting your order; no other driver is available at the moment.",
    });
  }

  return { message: "success", released: true, ...next };
};
/**
 * Whole-job cancellation of a queue order (Docs/queue-order-cancellation.md).
 * If an entry is currently holding the cancelled order's offer (`requested`),
 * release it back to `waiting` in place (position preserved, `queueNumber`
 * untouched) without counting a refusal and without advancing the order (there
 * is no next driver — the order is gone). No-op for non-queue orders and for
 * entries already `waiting`/`agreed`. Idempotent.
 */
exports.releaseEntryOnOrderCancel = async ({
  shipperRequestUniqueId,
  user,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.vehicleDriverUniqueId, vd.driverUserUniqueId, dq.status, u.phoneNumber AS driverPhoneNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u          ON u.userUniqueId           = vd.driverUserUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status IN (
       ${QUEUE_STATUS.REQUESTED},
       ${QUEUE_STATUS.NO_ANSWER_FROM_DRIVER},
       ${QUEUE_STATUS.AGREED},
       ${QUEUE_STATUS.GO_TO_LOADING_PLACE},
       ${QUEUE_STATUS.LOADING},
       ${QUEUE_STATUS.LOADED},
       ${QUEUE_STATUS.JOURNEY_STARTED}
     )
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC LIMIT 1
     FOR UPDATE`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { released: false };
  }

  const entry = rows[0];
  // Pre-accept (REQUESTED / retained NO_ANSWER) → the entry goes back to
  // waiting, position kept, no penalty. Post-accept (agreed / loading stages /
  // journey started) → the entry is CLOSED as cancelled_after_accept (same
  // closure as checkout) so the order's cancelled journey cannot leave a
  // dangling "agreed" slot; NO refusal penalty — the job was cancelled by the
  // shipper/admin, not backed out by the driver.
  const isPreAccept =
    entry.status === QUEUE_STATUS.REQUESTED ||
    entry.status === QUEUE_STATUS.NO_ANSWER_FROM_DRIVER;
  const closedStatus = isPreAccept
    ? QUEUE_STATUS.WAITING
    : QUEUE_STATUS.CANCELLED_AFTER_ACCEPT;

  // Terminalize the driver's pending request for this order (idempotent — no-op
  // when the accept/cancel path already moved it off `requested`). Prevents a
  // `requested` decision for a cancelled order lingering on the driver's app.
  await terminalizeQueueOrderRequest({
    executor,
    driverUserUniqueId: entry.driverUserUniqueId,
    shipperRequestUniqueId,
    actor: user ?? { userUniqueId: entry.driverUserUniqueId },
  });

  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.ORDER_CANCELLED,
    performedBy: user?.userUniqueId || null,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: closedStatus,
      requestedAt: null,
      shipperRequestUniqueId: null,
      ...(isPreAccept
        ? {}
        : {
            queueDeletedAt: currentDate(),
            queueDeletedBy: user?.userUniqueId || null,
          }),
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user?.userUniqueId || null,
    },
    conditions: { queueId: entry.queueId },
  });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    messageType: "queue_order_cancelled",
    message: {
      queueUniqueId: entry.queueUniqueId,
      driverUserUniqueId: entry.driverUserUniqueId,
    },
  });

  if (!isPreAccept && entry.driverPhoneNumber) {
    await sendSocketIONotificationToDriver({
      phoneNumber: entry.driverPhoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes.queue_order_cancelled,
        message: "Your queue job was cancelled — the assigned order is closed",
        status: null,
        queue: {
          queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
          queueUniqueId: entry.queueUniqueId,
          queueNumber: entry.queueNumber,
          status: QUEUE_STATUS.CANCELLED_AFTER_ACCEPT,
        },
        shipper: null,
        driver: null,
        journey: null,
        decision: null,
      },
    });
  }

  return {
    released: true,
    queueUniqueId: entry.queueUniqueId,
    closedStatus,
  };
};
/**
 * Consecutive-refusal policy (Docs/queue-refusal-policy.md). A driver who
 * refuses an offer keeps their position for the next order, but after
 * `QUEUE_REFUSAL_LIMIT` consecutive front-position refusals this queue day they
 * are moved to the back of the line. `entry` must carry `queueId`, `queueNumber`,
 * `queueOrganizationUniqueId`, `queueDate`, `vehicleTypeUniqueId` and
 * `queueRefusalCount`. Returns `{ movedToBack, refusalCount }`.
 */
const applyRefusalPolicy = async ({ executor, entry, user }) => {
  const refusalCount = (entry.queueRefusalCount || 0) + 1;
  const movedToBack = refusalCount >= QUEUE_REFUSAL_LIMIT;

  const updateValues = {
    queueRefusalCount: movedToBack ? 0 : refusalCount,
    queueUpdatedAt: currentDate(),
    queueUpdatedBy: user.userUniqueId,
  };
  if (movedToBack) {
    updateValues.queueNumber = await nextQueueNumber(
      executor,
      entry.queueOrganizationUniqueId,
      entry.queueDate,
      entry.vehicleTypeUniqueId,
    );
  }

  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.REFUSAL,
    performedBy: user.userUniqueId,
  });

  await updateData({
    tableName: "DriverQueue",
    updateValues,
    conditions: { queueId: entry.queueId },
  });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  if (movedToBack) {
    notifyQueueOrgAdmins({
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      messageType: "queue_refusal_moved_to_back",
      message: {
        queueUniqueId: entry.queueUniqueId,
        driverUserUniqueId: entry.driverUserUniqueId,
        refusalCount,
        refusalLimit: QUEUE_REFUSAL_LIMIT,
      },
    });
  }

  return { movedToBack, refusalCount };
};
/**
 * releaseEntryForUnselectedBidder
 * ─────────────────────────────
 * A BID order that was surfaced through a driver's check-in pull has a LINKED
 * DriverQueue entry (status REQUESTED). When the shipper selects a different
 * driver, that entry must not keep holding the (now-lost) order: unlink it and
 * return the driver to the WAITING pool so they stay in the queue for the next
 * offer. No-op when the driver has no linked entry for the order (creation-path
 * bids never link one).
 *
 * @param {Object} params
 * @param {string} params.shipperRequestUniqueId - The order unique id
 * @param {string} params.userUniqueId - The loser driver's user unique id
 * @returns {Promise<{released: boolean}>}
 */
exports.releaseEntryForUnselectedBidder = async ({
  shipperRequestUniqueId,
  userUniqueId,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate,
            vd.driverUserUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
      WHERE dq.shipperRequestUniqueId = ?
        AND vd.driverUserUniqueId = ?
        AND dq.status IN (${QUEUE_STATUS.REQUESTED}, ${QUEUE_STATUS.NO_ANSWER_FROM_DRIVER})
        AND dq.queueDeletedAt IS NULL
      LIMIT 1
      FOR UPDATE`,
    [shipperRequestUniqueId, userUniqueId],
  );
  const entry = rows[0] || null;
  if (!entry) {
    return { released: false };
  }
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.NOT_SELECTED,
    performedBy: null,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.WAITING,
      shipperRequestUniqueId: null,
      queueUpdatedBy: null,
      queueUpdatedAt: currentDate(),
    },
    conditions: { queueId: entry.queueId },
  });
  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  return { released: true };
};

module.exports.offerToNextDriver = offerToNextDriver;
module.exports.applyRefusalPolicy = applyRefusalPolicy;
module.exports.resetOrderToWaitingIfUnheld = resetOrderToWaitingIfUnheld;
