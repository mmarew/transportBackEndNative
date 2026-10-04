"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createData } = require("../../CRUD/Create/CreateData");
const {
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
} = require("../../Utils/QueueSocket");
const {
  today,
  LIVE_ENTRY_STATUSES,
  QUEUE_STATUS,
  HISTORY_EVENT,
  logQueueHistory,
  terminalizeQueueOrderRequest,
  hasActiveJob,
  resolveActiveOrderForDriver,
} = require("./helpers");

const { offerToNextDriver } = require("./release.service");
const { notifyShipperOfQueueEvent } = require("./dispatch-notify");

/**
 * Driver leaves the queue (checkout / no-show) — entry marked terminal.
 * If queueOrganizationUniqueId provided, scope to that org; otherwise find via fence.
 *
 * Scans ALL live statuses (waiting AND job holders) so a job holder is never
 * told "not in the queue" while myPosition still shows their entry:
 *   - Waiting entries (1/2/16/18)  → normal checkout; a held offer (2/16) is
 *     released to the next driver of the same vehicle type.
 *   - Job holder WITH an order (3/5/6/7/8, linkage resolvable — direct or
 *     legacy-healed) → 409: the job must leave by its own door (driver
 *     cancel-after-accept / journey completion / shipper cancel), never by
 *     checkout — otherwise the order would be orphaned from the queue side
 *     while the journey continues.
 *   - LEGACY AGREED GHOST (status 3, NO order linkage anywhere) → allowed.
 *     These are pre-accept-linkage rows whose bid decision never resolved
 *     (e.g. the order was cancelled or the linkage was never written); the
 *     driver is stuck as a phantom job holder with no order to cancel, so
 *     checkout is the only way out.
 */
exports.checkout = async (queueOrganizationUniqueId, user) => {
  const executor = db();
  const queueDate = today();

  let rows;
  if (queueOrganizationUniqueId) {
    [rows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status,
              dq.shipperRequestUniqueId, dq.vehicleDriverUniqueId, v.vehicleTypeUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v        ON v.vehicleUniqueId         = vd.vehicleUniqueId
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
         AND vd.driverUserUniqueId = ? AND dq.status IN (${LIVE_ENTRY_STATUSES.join(", ")})
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [queueOrganizationUniqueId, queueDate, user.userUniqueId],
    );
  } else {
    // FENCE: find driver's active queue across all orgs
    [rows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status,
              dq.shipperRequestUniqueId, dq.vehicleDriverUniqueId, v.vehicleTypeUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v        ON v.vehicleUniqueId         = vd.vehicleUniqueId
       WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ? AND dq.status IN (${LIVE_ENTRY_STATUSES.join(", ")})
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [queueDate, user.userUniqueId],
    );
  }
  if (rows.length === 0) {
    throw new AppError(
      "Driver is not in the queue for today",
      AppError.NOT_FOUND,
    );
  }

  const orgId = rows[0].queueOrganizationUniqueId;

  // A job holder cannot walk out of an ACCEPTED order through checkout — the
  // order must be cancelled/completed through its own flow (which releases
  // the entry and re-offers it). Exception: the legacy AGREED GHOST (status 3
  // with no order linkage anywhere) — nothing to cancel, so allow checkout.
  if (hasActiveJob(rows[0].status)) {
    const linkedOrder =
      rows[0].shipperRequestUniqueId ||
      (await resolveActiveOrderForDriver(executor, user.userUniqueId));
    if (linkedOrder) {
      throw new AppError(
        "You hold an active job — cancel the order or complete the journey before leaving the queue",
        AppError.CONFLICT,
      );
    }
  }

  // An entry can hold an order while offered (REQUESTED) or while retained
  // after an unanswered offer (NO_ANSWER_FROM_DRIVER). Both must be released
  // to the next driver when this driver leaves the line — never discarded.
  const holdsOrder =
    rows[0].status === QUEUE_STATUS.REQUESTED ||
    rows[0].status === QUEUE_STATUS.NO_ANSWER_FROM_DRIVER;
  const releasedOrder = holdsOrder ? rows[0].shipperRequestUniqueId : null;

  await logQueueHistory(executor, {
    queueUniqueId: rows[0].queueUniqueId,
    event: HISTORY_EVENT.CHECKOUT,
    performedBy: user.userUniqueId,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.CANCELLED_AFTER_ACCEPT,
      shipperRequestUniqueId: null,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
      queueDeletedAt: currentDate(),
      queueDeletedBy: user.userUniqueId,
    },
    conditions: { queueId: rows[0].queueId },
  });

  await createData(
    {
      tableName: "QueueAuditLog",
      insertValues: {
        queueAuditUniqueId: uuidv4(),
        queueOrganizationUniqueId: orgId,
        queueDate,
        queueUniqueId: rows[0].queueUniqueId,
        action: "remove",
        beforeValue: JSON.stringify({
          status: rows[0].status,
          shipperRequestUniqueId: rows[0].shipperRequestUniqueId,
        }),
        afterValue: JSON.stringify({
          status: QUEUE_STATUS.CANCELLED_AFTER_ACCEPT,
          shipperRequestUniqueId: null,
        }),
        performedBy: user.userUniqueId,
      },
    },
    executor,
  );

  await emitQueueSnapshot({ queueOrganizationUniqueId: orgId, queueDate });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: orgId,
    messageType: "queue_removed",
  });

  // The order this driver was holding must not be orphaned: terminalize their
  // pending request for it (offer window / checkout leaves no live offer
  // dangling), then offer it to the NEXT waiting driver of the same vehicle
  // type. No next driver → the order simply stays waiting for the next
  // check-in/rescan; the shipper is told either way.
  let reoffered = false;
  if (releasedOrder) {
    await terminalizeQueueOrderRequest({
      executor,
      driverUserUniqueId: user.userUniqueId,
      shipperRequestUniqueId: releasedOrder,
      actor: user,
    });
    const next = await offerToNextDriver({
      executor,
      queueOrganizationUniqueId: orgId,
      queueDate,
      vehicleTypeUniqueId: rows[0].vehicleTypeUniqueId,
      excludeVehicleDriverUniqueId: rows[0].vehicleDriverUniqueId,
      shipperRequestUniqueId: releasedOrder,
      user,
    });
    reoffered = next.offered === true;
    await notifyShipperOfQueueEvent({
      executor,
      shipperRequestUniqueId: releasedOrder,
      messageType: "queue_order_reoffered",
      message: reoffered
        ? "Driver left the queue; your order was passed to the next driver."
        : "Driver left the queue while your order was still open; it stays waiting for the next available driver.",
    });
  }

  return {
    message: "success",
    data: {
      queueUniqueId: rows[0].queueUniqueId,
      status: QUEUE_STATUS.CANCELLED_AFTER_ACCEPT,
      releasedOrder,
      reoffered,
    },
  };
};
