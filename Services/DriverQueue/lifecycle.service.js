"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate, minutesAgo } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createData } = require("../../CRUD/Create/CreateData");
const { emitQueueSnapshot, notifyQueueOrgAdmins } = require("../../Utils/QueueSocket");
const { sendSocketIONotificationToDriver } = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const {
  today, logQueueHistory, nextQueueNumber,
  QUEUE_OFFER_WINDOW_MINUTES, QUEUE_REFUSAL_LIMIT,
} = require("./helpers");
const { offerToNextDriver, notifyShipperOfQueueEvent } = require("./dispatch");

/**
 * Any rejection of a queue order's offer — driver-side or shipper-side (shipper
 * rejects the driver's quoted price) — marks the entry `notagreed` (keeps
 * position, stays in line, remains eligible for the next order), advances the
 * ORDER to the next driver of the same vehicle type, and counts one penalty
 * point toward the driver's refusal limit (applyRefusalPolicy). Pass
 * `driverUserUniqueId` to restrict to a specific driver (driver-side reject);
 * omit it to clear whichever entry holds the order (shipper-side price
 * rejection).
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
     WHERE dq.shipperRequestUniqueId = ? AND dq.status = 'requested'
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
    columnName: "status",
    oldValue: entry.status,
    newValue: "notagreed",
    performedBy: user.userUniqueId,
  });
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    columnName: "shipperRequestUniqueId",
    oldValue: entry.shipperRequestUniqueId,
    newValue: null,
    performedBy: user.userUniqueId,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "notagreed",
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
    afterQueueNumber: entry.queueNumber,
    excludeVehicleDriverUniqueId: entry.vehicleDriverUniqueId,
    shipperRequestUniqueId,
    user,
  });

  return { message: "success", ...next };
};


/**
 * Close a queue slot once the driver COMPLETED its queue order's journey.
 * The entry is marked 'removed' — the same closed state as checkout/leave — so
 * the driver is out of the queue and MUST re-register for the next placement
 * (re-checkin revives the entry with a fresh queue number at the back of the
 * line). Idempotent: no-op unless the entry is still 'agreed' and holding the
 * completed order. Called from completeJourney after the transaction commits.
 */
exports.closeEntryOnJourneyCompletion = async ({
  shipperRequestUniqueId,
  userUniqueId,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate, status
     FROM DriverQueue
     WHERE shipperRequestUniqueId = ? AND status = 'agreed'
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
    columnName: "status",
    oldValue: entry.status,
    newValue: "removed",
    performedBy: userUniqueId || null,
  });
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    columnName: "shipperRequestUniqueId",
    oldValue: shipperRequestUniqueId,
    newValue: null,
    performedBy: userUniqueId || null,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "removed",
      shipperRequestUniqueId: null,
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
    messageType: "queue_removed",
  });

  return { closed: true, queueUniqueId: entry.queueUniqueId };
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
            dq.vehicleDriverUniqueId, vd.driverUserUniqueId, dq.status
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status = 'requested'
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC LIMIT 1
     FOR UPDATE`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { released: false };
  }

  const entry = rows[0];
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    columnName: "status",
    oldValue: entry.status,
    newValue: "waiting",
    performedBy: user?.userUniqueId || null,
  });
  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    columnName: "shipperRequestUniqueId",
    oldValue: entry.shipperRequestUniqueId,
    newValue: null,
    performedBy: user?.userUniqueId || null,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "waiting",
      requestedAt: null,
      shipperRequestUniqueId: null,
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

  return { released: true, queueUniqueId: entry.queueUniqueId };
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
    columnName: "queueRefusalCount",
    oldValue: entry.queueRefusalCount,
    newValue: movedToBack ? 0 : refusalCount,
    performedBy: user.userUniqueId,
  });
  if (movedToBack) {
    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "queueNumber",
      oldValue: entry.queueNumber,
      newValue: updateValues.queueNumber,
      performedBy: user.userUniqueId,
    });
  }

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
 * Driver accepts the queue offer → the entry is marked `agreed` (leaves the
 * dispatch line; journey progress is tracked on the driver's JourneyDecisions /
 * DriverRequest journeyStatusId). Called from the accept flow after the
 * JourneyDecision moves to acceptedByDriver.
 */
exports.markEntryAgreed = async ({ shipperRequestUniqueId, userUniqueId }) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status,
            u.fullName AS driverName, u.phoneNumber AS driverPhoneNumber,
            v.licensePlate, vt.vehicleTypeName
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId         = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId    = v.vehicleTypeUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status = 'requested' AND dq.queueDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { updated: false };
  }
  await logQueueHistory(executor, {
    queueUniqueId: rows[0].queueUniqueId,
    columnName: "status",
    oldValue: rows[0].status,
    newValue: "agreed",
    performedBy: userUniqueId || null,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "agreed",
      agreedAt: currentDate(),
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: userUniqueId || null,
    },
    conditions: { queueId: rows[0].queueId },
  });
  await emitQueueSnapshot({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    queueDate: rows[0].queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
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
          driverName: rows[0].driverName,
          driverPhoneNumber: rows[0].driverPhoneNumber,
        },
        vehicle: {
          licensePlate: rows[0].licensePlate,
          vehicleTypeName: rows[0].vehicleTypeName,
        },
      },
      queue: {
        queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
        queueDate: rows[0].queueDate,
      },
    },
  });
  return { updated: true };
};


/**
 * Implicit reject (offer window expired) — find every entry that is still
 * `requested` past the window with a linked order still `requested`, mark the
 * decision + driver request free (implicit reject), move the entry to
 * `notagreed` in place (position kept, still in line for the next order), and
 * advance the order. Called by the background automatic-timeout scan. `actor`
 * is the user stamped on the audit trail (the order's creator).
 */
exports.releaseExpiredOffers = async ({
  windowMinutes = QUEUE_OFFER_WINDOW_MINUTES,
} = {}) => {
  const executor = db();
  // `requestedAt` is written by `currentDate()` as EAT wall-clock; compare against
  // a cutoff computed in the SAME domain. A UTC `Date` here gets serialized by
  // mysql2 in the process timezone, skewing the comparison by the offset — a
  // 3-hour skew made every fresh offer look already-expired (releasing offers
  // seconds after they were made).
  const cutoff = minutesAgo(windowMinutes);

  const [expired] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.queueRefusalCount, dq.vehicleDriverUniqueId, vd.driverUserUniqueId, dq.shipperRequestUniqueId,
            v.vehicleTypeUniqueId,
            sr.shipperRequestId, sr.shipperRequestCreatedBy,
            dr.driverRequestId, dr.driverRequestUniqueId, jd.journeyDecisionUniqueId,
            u.phoneNumber AS driverPhoneNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN ShipperRequest sr ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
     JOIN DriverRequest dr ON dr.userUniqueId = vd.driverUserUniqueId
       AND dr.journeyStatusId = ?
     JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
       AND jd.shipperRequestId = sr.shipperRequestId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     WHERE dq.status = 'requested' AND dq.queueDeletedAt IS NULL
       AND dq.requestedAt IS NOT NULL AND dq.requestedAt < ?
       AND sr.journeyStatusId = ?
     ORDER BY dq.requestedAt ASC`,
    [journeyStatusMap.requested, cutoff, journeyStatusMap.requested],
  );

  const advanced = [];
  for (const entry of expired) {
    const actor = { userUniqueId: entry.shipperRequestCreatedBy };
    const now = currentDate();

    await updateData({
      tableName: "JourneyDecisions",
      updateValues: {
        journeyStatusId: journeyStatusMap.rejectedByDriver,
        journeyDecisionUpdatedAt: now,
        journeyDecisionUpdatedBy: actor.userUniqueId,
        isCancellationByDriverSeenByShipper: "no need to see it",
      },
      conditions: { journeyDecisionUniqueId: entry.journeyDecisionUniqueId },
    });
    // Move the driver request to a TERMINAL status (rejectedByDriver, matching
    // the decision above), NOT back to `waiting`. A `waiting` request that still
    // carries a decision can never be reused (JourneyDecisions.driverRequestId
    // is UNIQUE) and keeps `activeRequestGuard = 1`, so the next offer for this
    // driver dies on the uq_driver_active_request insert.
    await updateData({
      tableName: "DriverRequest",
      updateValues: {
        journeyStatusId: journeyStatusMap.rejectedByDriver,
        driverRequestUpdatedAt: now,
        driverRequestUpdatedBy: actor.userUniqueId,
      },
      conditions: { driverRequestId: entry.driverRequestId },
    });
    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "status",
      oldValue: entry.status,
      newValue: "notagreed",
      performedBy: actor.userUniqueId,
    });
    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "shipperRequestUniqueId",
      oldValue: entry.shipperRequestUniqueId,
      newValue: null,
      performedBy: actor.userUniqueId,
    });
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "notagreed",
        requestedAt: null,
        shipperRequestUniqueId: null,
        queueUpdatedAt: now,
        queueUpdatedBy: actor.userUniqueId,
      },
      conditions: { queueId: entry.queueId },
    });

    await applyRefusalPolicy({ executor, entry, user: actor });

    // Tell the released driver their offer window expired and the order moved
    // on — without this the app keeps showing the offer card (or silently
    // drops it on the next poll) with no explanation. Best-effort: offline
    // driver is covered by the REST poll fallback.
    if (entry.driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        phoneNumber: entry.driverPhoneNumber,
        eventName: "queue",
        message: {
          messageTypes: messageTypes.queue_order_rejected,
          message: "Order passed to next driver",
          status: null,
          queue: {
            queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
            queueUniqueId: entry.queueUniqueId,
            queueNumber: entry.queueNumber,
            status: "waiting",
          },
          shipper: null,
          driver: null,
          journey: null,
          decision: null,
        },
      });
    }

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
      afterQueueNumber: entry.queueNumber,
      excludeVehicleDriverUniqueId: entry.vehicleDriverUniqueId,
      shipperRequestUniqueId: entry.shipperRequestUniqueId,
      user: actor,
    });
    advanced.push({ queueUniqueId: entry.queueUniqueId, ...next });
  }

  return { message: "success", data: { released: advanced.length, advanced } };
};


/**
 * Get the column-level change history for a queue entry.
 * Returns DriverQueueHistory rows sorted by most recent first.
 * Driver can view own entry; QueueOrgAdmin can view any entry.
 */
exports.getEntryHistory = async (queueUniqueId, user) => {
  const executor = db();

  const [entry] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.vehicleDriverUniqueId,
            vd.driverUserUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.queueUniqueId = ? AND dq.queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (entry.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }

  // Ownership check: driver can only view own entry's history; admins bypass
  const isAdmin =
    user.roleId === usersRoles.adminRoleId ||
    user.roleId === usersRoles.supperAdminRoleId ||
    user.roleId === usersRoles.queueOrgAdminRoleId;
  if (!isAdmin && entry[0].driverUserUniqueId !== user.userUniqueId) {
    throw new AppError(
      "Not authorized to view this entry's history",
      AppError.FORBIDDEN,
    );
  }

  const [history] = await executor.query(
    `SELECT historyUniqueId, columnName, oldValue, performedBy, performedAt
     FROM DriverQueueHistory
     WHERE queueUniqueId = ?
     ORDER BY performedAt DESC`,
    [queueUniqueId],
  );

  return { message: "success", data: history };
};



module.exports = exports;
