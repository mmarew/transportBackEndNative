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
const { usersRoles } = require("../../Utils/ListOfSeedData");
const {
  today,
  QUEUE_STATUS,
  HISTORY_EVENT,
  queueOrgReady,
  resolveShipperUserByPhone,
  resolveActiveVehicleDriver,
  hasActiveJourney,
  getDriverQueueState,
  logQueueHistory,
  nextQueueNumber,
} = require("./helpers");
const { rescanPendingQueueOrder } = require("./dispatch.service");
const { releaseRequestedOffer } = require("./dispatch-offer.service");
const { offerToNextDriver } = require("./release.service");

/**
 * QueueOrgAdmin manually checks a driver/vehicle into the queue.
 *
 * Mirrors `checkin`'s create-new-data rule: a brand-new row is inserted with a
 * fresh queueUniqueId and a back-of-line queueNumber. The previous entry is
 * NEVER mutated (old rows keep their terminal/completed state). If the driver
 * already holds a LIVE entry today, the existing entry is returned unchanged.
 */
exports.manualCheckin = async (data) => {
  const {
    queueOrganizationUniqueId,
    vehicleDriverUniqueId,
    driverPhoneNumber,
    user,
  } = data;
  const executor = db();

  let targetedShipperUserUUID = null;
  if (data.shipperPhoneNumber) {
    targetedShipperUserUUID = await resolveShipperUserByPhone(
      data.shipperPhoneNumber,
      user.userUniqueId,
    );
  }

  await queueOrgReady(executor, queueOrganizationUniqueId);

  // Resolve the driver: by UUID if provided, otherwise by phone number.
  let vehicleDriver;
  if (vehicleDriverUniqueId) {
    vehicleDriver = await resolveActiveVehicleDriver({ vehicleDriverUniqueId });
  } else if (driverPhoneNumber) {
    vehicleDriver = await resolveActiveVehicleDriver({
      phoneNumber: driverPhoneNumber,
    });
  } else {
    throw new AppError(
      "Provide vehicleDriverUniqueId or driverPhoneNumber",
      AppError.BAD_REQUEST,
    );
  }
  const queueDate = today();

  // FENCE: a driver holding an ACTIVE engagement — an UNRESOLVED queue offer
  // (status 2 = requested) or an in-flight journey (accepted/started, not yet
  // completed or cancelled) — cannot be force-checked in. Retiring the queue
  // entry that carries the live offer would orphan it, so the driver must
  // cancel/accept the existing connection first.
  if (await hasActiveJourney(executor, vehicleDriver.driverUserUniqueId)) {
    throw new AppError(
      "Driver has an active journey — finish or cancel it before joining the queue",
      AppError.CONFLICT,
    );
  }

  // FENCE: driver can only be in ONE ACTIVE queue system-wide per day; an
  // active entry in a different org is rejected. Re-check-in while a LIVE entry
  // exists at the same org is idempotent — the existing entry is returned and
  // no new row is inserted. Re-check-in creates a NEW row only once the day is
  // clean (prior entry terminal — completed/checked out); previous rows are
  // NEVER mutated by manual check-in.
  const { active } = await getDriverQueueState(
    executor,
    vehicleDriver.driverUserUniqueId,
    queueDate,
  );
  if (active) {
    if (active.queueOrganizationUniqueId !== queueOrganizationUniqueId) {
      // FENCE: driver is already active in ANOTHER org today. One queue per
      // driver per day system-wide — reject rather than silently return.
      throw new AppError(
        "Driver is already in a queue for today — one queue per day",
        AppError.CONFLICT,
      );
    }
    // Same-org live entry — idempotent re-check-in: return it unchanged.
    return {
      message: "success",
      data: {
        alreadyCheckedIn: true,
        queueUniqueId: active.queueUniqueId,
        queueNumber: active.queueNumber,
        status: active.status,
        queueOrganizationUniqueId: active.queueOrganizationUniqueId,
        queueOrganizationName: active.queueOrganizationName,
      },
    };
  }

  // The day is clean — insert a fresh row (new queueUniqueId + back-of-line
  // queueNumber). Multiple historical rows per driver/org/day are retained; the
  // live one is the newest with queueDeletedAt IS NULL.

  const queueUniqueId = uuidv4();
  const assignedNumber = await nextQueueNumber(
    executor,
    queueOrganizationUniqueId,
    queueDate,
    vehicleDriver.vehicleTypeUniqueId,
  );

  try {
    await createData({
      tableName: "DriverQueue",
      insertValues: {
        queueUniqueId,
        queueOrganizationUniqueId,
        queueDate,
        queueNumber: assignedNumber,
        vehicleDriverUniqueId: vehicleDriver.vehicleDriverUniqueId,
        targetedShipperUserUUID,
        joinedAt: currentDate(),
        status: QUEUE_STATUS.WAITING,
        queueCreatedBy: user.userUniqueId,
      },
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      throw new AppError(
        "Driver is already in the queue for this day",
        AppError.CONFLICT,
      );
    }
    throw error;
  }

  // Audit for the fresh entry: creation status + any shipper reservation applied
  // at manual check-in (mirrors `checkin`). One snapshot holds the created row.
  await logQueueHistory(executor, {
    queueUniqueId,
    event: HISTORY_EVENT.MANUAL_CHECKIN,
    performedBy: user.userUniqueId,
  });

  await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });
  notifyQueueOrgAdmins({ queueOrganizationUniqueId });

  // Audit log for manual checkin
  await createData(
    {
      tableName: "QueueAuditLog",
      insertValues: {
        queueAuditUniqueId: uuidv4(),
        queueOrganizationUniqueId,
        queueDate,
        queueUniqueId,
        action: "manual_checkin",
        afterValue: JSON.stringify({
          queueNumber: assignedNumber,
          status: QUEUE_STATUS.WAITING,
        }),
        performedBy: user.userUniqueId,
      },
    },
    executor,
  );

  // Auto-dispatch pending orders to this newly available driver
  await rescanPendingQueueOrder({
    queueOrganizationUniqueId,
    vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
    user,
    executor,
  });

  return {
    message: "success",
    data: {
      queueUniqueId,
      queueNumber: assignedNumber,
      status: QUEUE_STATUS.WAITING,
    },
  };
};
/**
 * Supervisor override — reorder a queue entry. Audit logged.
 */
exports.overrideEntry = async (queueUniqueId, body, user) => {
  const executor = db();
  const { queueNumber, reason } = body;

  const [rows] = await executor.query(
    `SELECT queueId, queueOrganizationUniqueId, queueDate, queueNumber, queueUniqueId FROM DriverQueue
     WHERE queueUniqueId = ? AND queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }

  await logQueueHistory(executor, {
    queueUniqueId: rows[0].queueUniqueId,
    event: HISTORY_EVENT.LANE_OVERRIDE,
    performedBy: user.userUniqueId,
  });

  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      queueNumber,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
    },
    conditions: { queueId: rows[0].queueId },
  });

  await createData({
    tableName: "QueueAuditLog",
    insertValues: {
      queueAuditUniqueId: uuidv4(),
      queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
      queueDate: rows[0].queueDate,
      queueUniqueId: rows[0].queueUniqueId,
      action: "override",
      beforeValue: JSON.stringify({ queueNumber: rows[0].queueNumber }),
      afterValue: JSON.stringify({ queueNumber }),
      reason: reason || null,
      performedBy: user.userUniqueId,
    },
  });

  await emitQueueSnapshot({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    queueDate: rows[0].queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    messageType: "queue_position_changed",
  });

  return { message: "success", data: { queueUniqueId, queueNumber } };
};
/**
 * Remove a queue entry (no-show / override / checkout by admin).
 */
exports.removeEntry = async (queueUniqueId, user) => {
  const executor = db();

  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.queueNumber,
            dq.vehicleDriverUniqueId, dq.queueUniqueId, dq.status,
            dq.shipperRequestUniqueId, v.vehicleTypeUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v         ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.queueUniqueId = ? AND dq.queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }
  const entry = rows[0];

  await logQueueHistory(executor, {
    queueUniqueId: entry.queueUniqueId,
    event: HISTORY_EVENT.REMOVE,
    performedBy: user.userUniqueId,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: QUEUE_STATUS.QUEUE_ADMIN_CANCELED,
      shipperRequestUniqueId: null,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
      queueDeletedAt: currentDate(),
      queueDeletedBy: user.userUniqueId,
    },
    conditions: { queueId: entry.queueId },
  });

  await createData({
    tableName: "QueueAuditLog",
    insertValues: {
      queueAuditUniqueId: uuidv4(),
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      queueDate: entry.queueDate,
      queueUniqueId: entry.queueUniqueId,
      action: "remove",
      beforeValue: JSON.stringify({ status: entry.status }),
      afterValue: JSON.stringify({ status: QUEUE_STATUS.QUEUE_ADMIN_CANCELED }),
      performedBy: user.userUniqueId,
    },
  });

  // Release a live offer: if the driver currently holds an unresolved
  // (requested) order on this entry, terminalize their active DriverRequest +
  // JourneyDecision and return the order to the queue so it advances to the
  // next eligible driver. Mirrors checkout semantics — a removed/checked-out
  // driver must not keep an active offer or leave an orphaned status-2 journey.
  const releasedOrder =
    entry.status === QUEUE_STATUS.REQUESTED
      ? entry.shipperRequestUniqueId
      : null;
  if (releasedOrder) {
    await releaseRequestedOffer({ executor, entry, user });
    const next = await offerToNextDriver({
      executor,
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      queueDate: entry.queueDate,
      vehicleTypeUniqueId: entry.vehicleTypeUniqueId,
      excludeVehicleDriverUniqueId: entry.vehicleDriverUniqueId,
      shipperRequestUniqueId: releasedOrder,
      user,
    });
    await emitQueueSnapshot({
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      queueDate: entry.queueDate,
    });
    notifyQueueOrgAdmins({
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      messageType: "queue_order_rejected",
    });
    return {
      message: "success",
      data: {
        queueUniqueId,
        status: QUEUE_STATUS.QUEUE_ADMIN_CANCELED,
        releasedOrder,
        ...next,
      },
    };
  }

  await emitQueueSnapshot({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    queueDate: entry.queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
    messageType: "queue_removed",
  });

  return {
    message: "success",
    data: {
      queueUniqueId,
      status: QUEUE_STATUS.QUEUE_ADMIN_CANCELED,
      releasedOrder,
    },
  };
};
/**
 * Get the snapshot audit trail for a queue entry.
 * Returns DriverQueueHistory rows (full entry snapshots) sorted by most recent first.
 * Driver can view own entry; QueueOrgAdmin can view any entry.
 */
exports.getEntryHistory = async (queueUniqueId, user, view) => {
  const executor = db();

  const [entry] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.vehicleDriverUniqueId,
            vd.driverUserUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.queueUniqueId = ?`,
    [queueUniqueId],
  );
  if (entry.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }

  // Ownership check: driver can only view own entry's history; admins bypass.
  // Org staff (11/12) must still hold an ACTIVE membership in the entry's org —
  // a suspended dispatcher loses this too.
  const isPlatformAdmin =
    user.roleId === usersRoles.adminRoleId ||
    user.roleId === usersRoles.supperAdminRoleId;
  const isOrgStaff =
    user.roleId === usersRoles.queueOrgAdminRoleId ||
    user.roleId === usersRoles.queueDispatcherRoleId;
  if (!isPlatformAdmin && !isOrgStaff) {
    if (entry[0].driverUserUniqueId !== user.userUniqueId) {
      throw new AppError(
        "Not authorized to view this entry's history",
        AppError.FORBIDDEN,
      );
    }
  } else if (isOrgStaff) {
    const [active] = await executor.query(
      `SELECT 1 FROM QueueOrganizationMembership
       WHERE queueOrganizationUniqueId = ?
         AND userUniqueId = ?
         AND roleId IN (?, ?)
         AND isActive = 1
         AND membershipDeletedAt IS NULL
       LIMIT 1`,
      [
        entry[0].queueOrganizationUniqueId,
        user.userUniqueId,
        usersRoles.queueOrgAdminRoleId,
        usersRoles.queueDispatcherRoleId,
      ],
    );
    if (active.length === 0) {
      throw new AppError(
        "Your access to this queue organization has been suspended or you are not an active staff member",
        AppError.FORBIDDEN,
      );
    }
  }

  const [history] = await executor.query(
    `SELECT historyUniqueId, historyEvent, performedBy, performedAt,
            queueId, queueUniqueId, queueOrganizationUniqueId, queueDate, queueNumber,
            queueRefusalCount, vehicleDriverUniqueId, shipperRequestUniqueId,
            targetedShipperUserUUID, driverLatitude, driverLongitude, joinedAt,
            status, requestedAt, agreedAt,
            queueCreatedAt, queueCreatedBy, queueUpdatedAt, queueUpdatedBy,
            queueDeletedAt, queueDeletedBy
     FROM DriverQueueHistory
     WHERE queueUniqueId = ?
     ORDER BY performedAt DESC`,
    [queueUniqueId],
  );

  // Columnar diff view: `?view=diff` returns one row per CHANGED column per
  // event (newest first). Each history row is the PRE-IMAGE of its event, so:
  //   oldValue = this snapshot's field, newValue = the next-older snapshot's
  //   field (state right after the event), or the live DriverQueue row for the
  //   oldest event.
  if (view === "diff") {
    const [live] = await executor.query(
      `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate, queueNumber,
              queueRefusalCount, vehicleDriverUniqueId, shipperRequestUniqueId,
              targetedShipperUserUUID, driverLatitude, driverLongitude, joinedAt,
              status, requestedAt, agreedAt,
              queueCreatedAt, queueCreatedBy, queueUpdatedAt, queueUpdatedBy,
              queueDeletedAt, queueDeletedBy
       FROM DriverQueue
       WHERE queueUniqueId = ?`,
      [queueUniqueId],
    );
    const meta = new Set([
      "historyUniqueId",
      "historyEvent",
      "performedBy",
      "performedAt",
    ]);
    const value = (v) =>
      v === undefined || v === null
        ? ""
        : v instanceof Date
          ? v.toISOString()
          : String(v);
    const diffs = [];
    for (let i = 0; i < history.length; i++) {
      const before = history[i];
      const after = history[i + 1] || live[0] || {};
      for (const key of Object.keys(before)) {
        if (meta.has(key)) continue;
        const oldValue = before[key];
        const newValue = after[key];
        if (value(oldValue) !== value(newValue)) {
          diffs.push({
            historyEvent: before.historyEvent,
            columnName: key,
            oldValue: oldValue == null ? null : oldValue,
            newValue: newValue == null ? null : newValue,
            performedBy: before.performedBy,
            performedAt: before.performedAt,
          });
        }
      }
    }
    return { message: "success", data: diffs, view: "diff" };
  }

  return { message: "success", data: history };
};
