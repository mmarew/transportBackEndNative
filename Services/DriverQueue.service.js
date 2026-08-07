"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db } = require("./CompanyHelper.service");
const {
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
} = require("../Utils/QueueSocket");
const {
  sendSocketIONotificationToDriver,
} = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");

const today = () => new Date().toISOString().slice(0, 10);
const QUEUE_OFFER_WINDOW_MINUTES = 3;

// Shared resolver: org → vehicle type via VehicleDriver → Vehicle
const queueOrgReady = async (executor, queueOrganizationUniqueId) => {
  const [org] = await executor.query(
    `SELECT queueOrganizationUniqueId, approvalStatus, queueEnabled
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  if (org.length === 0) {
    throw new AppError("Queue organization not found", 404);
  }
  return org[0];
};

const getVehicleDriverType = async (executor, vehicleDriverUniqueId) => {
  const [rows] = await executor.query(
    `SELECT vd.driverUserUniqueId, vd.vehicleUniqueId, v.vehicleTypeUniqueId,
            u.phoneNumber
     FROM VehicleDriver vd
     JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
     JOIN Users u   ON u.userUniqueId   = vd.driverUserUniqueId
     WHERE vd.vehicleDriverUniqueId = ? AND vd.assignmentStatus = 'active'
       AND vd.vehicleDriverDeletedAt IS NULL`,
    [vehicleDriverUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Active vehicle-driver assignment not found", 404);
  }
  return rows[0];
};

const nextQueueNumber = async (executor, queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId) => {
  const [agg] = await executor.query(
    `SELECT COALESCE(MAX(dq.queueNumber), 0) + 1 AS nextNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.queueDeletedAt IS NULL
       AND v.vehicleTypeUniqueId = ?`,
    [queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId],
  );
  return agg[0].nextNumber;
};

const publicEntry = (row) => ({
  queueUniqueId: row.queueUniqueId,
  queueNumber: row.queueNumber,
  joinedAt: row.joinedAt,
  status: row.status,
  offeredAt: row.offeredAt,
  loadedAt: row.loadedAt,
  vehicleDriverUniqueId: row.vehicleDriverUniqueId,
  driverUserUniqueId: row.driverUserUniqueId,
  driverName: row.fullName,
  driverPhoneNumber: row.phoneNumber,
  vehicleTypeUniqueId: row.vehicleTypeUniqueId,
  shipperRequestUniqueId: row.shipperRequestUniqueId,
});

// A driver is still "in queue" while waiting or holding a dispatch offer.
// Removed (cancelled/checked-out) and loaded (dispatched/completed) drivers are
// free to check back in.
const IN_QUEUE_STATUSES = ["waiting", "offered"];

/**
 * Driver's queue entries for today (across all orgs — fence). Returns:
 * - `active`: first entry still in the queue (blocks re-checkin), or null
 * - `atOrg`: existing entry at the target org (revived on re-checkin so the
 *   (vehicleDriverUniqueId, queueOrganizationUniqueId, queueDate) unique key is
 *   reused instead of colliding), or null
 */
const getDriverQueueState = async (executor, driverUserUniqueId, queueDate, targetOrgId) => {
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueNumber, dq.status,
            o.queueOrganizationName
     FROM DriverQueue dq
     JOIN QueueOrganization o ON o.queueOrganizationUniqueId = dq.queueOrganizationUniqueId
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL`,
    [queueDate, driverUserUniqueId],
  );
  const active = rows.find((r) => IN_QUEUE_STATUSES.includes(r.status)) || null;
  const atOrg = rows.find((r) => r.queueOrganizationUniqueId === targetOrgId) || null;
  return { active, atOrg, rows };
};

/**
 * Driver joins the queue — virtual check-in from anywhere. Server stamps the
 * position per (queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId).
 */
exports.checkin = async (data) => {
  const { queueOrganizationUniqueId, vehicleDriverUniqueId, user } = data;
  const executor = db();

  const org = await queueOrgReady(executor, queueOrganizationUniqueId);
  if (org.approvalStatus !== "approved" || !org.queueEnabled) {
    throw new AppError("Queue organization is not enabled for dispatch", 403);
  }

  const vehicleDriver = await getVehicleDriverType(executor, vehicleDriverUniqueId);
  const queueDate = today();

  // FENCE: driver can only be in ONE queue system-wide per day. Removed/loaded
  // entries are free, so re-checkin revives the same-org entry instead of
  // colliding with the (vehicleDriverUniqueId, org, date) unique key.
  const { active, atOrg } = await getDriverQueueState(
    executor,
    vehicleDriver.driverUserUniqueId,
    queueDate,
    queueOrganizationUniqueId,
  );
  if (active) {
    // Idempotent: already in a queue today — return the existing entry.
    return {
      message: "success",
      data: {
        queueUniqueId: active.queueUniqueId,
        queueOrganizationUniqueId: active.queueOrganizationUniqueId,
        queueDate,
        queueNumber: active.queueNumber,
        position: active.queueNumber,
        vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
      },
    };
  }

  let queueUniqueId;
  let queueNumber;
  if (atOrg) {
    // Re-check-in: revive the previous entry for the same org + day.
    queueNumber = await nextQueueNumber(
      executor,
      queueOrganizationUniqueId,
      queueDate,
      vehicleDriver.vehicleTypeUniqueId,
    );
    queueUniqueId = atOrg.queueUniqueId;
    await executor.query(
      `UPDATE DriverQueue
       SET status = 'waiting', queueNumber = ?, joinedAt = ?,
           offeredAt = NULL, loadedAt = NULL, shipperRequestUniqueId = NULL,
           queueUpdatedAt = ?, queueUpdatedBy = ?
       WHERE queueId = ?`,
      [queueNumber, currentDate(), currentDate(), user.userUniqueId, atOrg.queueId],
    );
  } else {
    queueNumber = await nextQueueNumber(
      executor,
      queueOrganizationUniqueId,
      queueDate,
      vehicleDriver.vehicleTypeUniqueId,
    );

    queueUniqueId = uuidv4();
    try {
      await executor.query(
        `INSERT INTO DriverQueue
          (queueUniqueId, queueOrganizationUniqueId, queueDate, queueNumber,
           vehicleDriverUniqueId, joinedAt, status, queueCreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)`,
        [
          queueUniqueId,
          queueOrganizationUniqueId,
          queueDate,
          queueNumber,
          vehicleDriverUniqueId,
          currentDate(),
          user.userUniqueId,
        ],
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new AppError("Driver is already in the queue for this day", 409);
      }
      throw error;
    }
  }

  await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_position_changed",
  });

  return {
    message: "success",
    data: {
      queueUniqueId,
      queueOrganizationUniqueId,
      queueDate,
      queueNumber,
      position: queueNumber,
      vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
    },
  };
};

/**
 * Driver's current position + how many are waiting ahead (per their type).
 * If queueOrganizationUniqueId is provided, search only that org.
 * If omitted, search across all orgs (fence: driver can only be in one queue system-wide).
 */
exports.myPosition = async (queueOrganizationUniqueId, user) => {
  const executor = db();
  const queueDate = today();

  let rows;
  if (queueOrganizationUniqueId) {
    [rows] = await executor.query(
      `SELECT dq.*, vd.driverUserUniqueId, v.vehicleTypeUniqueId, dq.queueOrganizationUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
         AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL
         AND dq.status NOT IN ('removed', 'loaded')
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [queueOrganizationUniqueId, queueDate, user.userUniqueId],
    );
  } else {
    // FENCE: driver can only be in one queue system-wide — search all orgs
    [rows] = await executor.query(
      `SELECT dq.*, vd.driverUserUniqueId, v.vehicleTypeUniqueId, dq.queueOrganizationUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
       WHERE dq.queueDate = ?
         AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL
         AND dq.status NOT IN ('removed', 'loaded')
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [queueDate, user.userUniqueId],
    );
  }

  if (rows.length === 0) {
    return {
      message: "success",
      data: [],
    };
  }

  const orgId = rows[0].queueOrganizationUniqueId;
  const vehicleType = rows[0].vehicleTypeUniqueId;
  const queueNum = rows[0].queueNumber;

  const [ahead] = await executor.query(
    `SELECT COUNT(*) AS total
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND v.vehicleTypeUniqueId = ? AND dq.status = 'waiting'
       AND dq.queueNumber < ? AND dq.queueDeletedAt IS NULL`,
    [orgId, queueDate, vehicleType, queueNum],
  );

  return {
    message: "success",
    data: {
      ...publicEntry(rows[0]),
      waitingAhead: ahead[0].total,
    },
  };
};

/**
 * Driver leaves the queue (checkout / no-show) — entry marked 'removed'.
 * If queueOrganizationUniqueId provided, scope to that org; otherwise find via fence.
 */
exports.checkout = async (queueOrganizationUniqueId, user) => {
  console.log('[Service checkout] Called with:', { queueOrganizationUniqueId, userUniqueId: user?.userUniqueId });
  const executor = db();
  const queueDate = today();

  let rows;
  if (queueOrganizationUniqueId) {
    [rows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
         AND vd.driverUserUniqueId = ? AND dq.status != 'removed'
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [queueOrganizationUniqueId, queueDate, user.userUniqueId],
    );
  } else {
    // FENCE: find driver's active queue across all orgs
    [rows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ? AND dq.status != 'removed'
         AND dq.queueDeletedAt IS NULL
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [queueDate, user.userUniqueId],
    );
  }
  console.log('[Service checkout] Query result:', { rowsCount: rows.length, rows });
  if (rows.length === 0) {
    throw new AppError("Driver is not in the queue for today", 404);
  }

  const orgId = rows[0].queueOrganizationUniqueId;
  await executor.query(
    `UPDATE DriverQueue SET status = 'removed', queueUpdatedAt = ?, queueUpdatedBy = ?
     WHERE queueId = ?`,
    [currentDate(), user.userUniqueId, rows[0].queueId],
  );

  await emitQueueSnapshot({ queueOrganizationUniqueId: orgId, queueDate });
  notifyQueueOrgAdmins({ queueOrganizationUniqueId: orgId, messageType: "queue_removed" });

  return { message: "success", data: { queueUniqueId: rows[0].queueUniqueId, status: "removed" } };
};

/**
 * Full queue for an org+day, grouped by vehicle type — the dispute truth.
 */
exports.getQueueStatus = async (queueOrganizationUniqueId, query) => {
  const executor = db();
  const queueDate = query.queueDate || today();

  // Get queue organization details
  const [orgRows] = await executor.query(
    `SELECT queueOrganizationUniqueId, queueOrganizationName, queueOrganizationType,
            queueOrganizationPhone, queueOrganizationAddress, latitude, longitude,
            approvalStatus, queueEnabled, approvedBy, approvedAt
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );

  if (orgRows.length === 0) {
    throw new AppError("Queue organization not found", 404);
  }
  const org = orgRows[0];

  const [rows] = await executor.query(
    `SELECT dq.queueUniqueId, dq.queueNumber, dq.joinedAt, dq.status,
            dq.offeredAt, dq.loadedAt, dq.vehicleDriverUniqueId,
            dq.shipperRequestUniqueId,
            vd.driverUserUniqueId, v.vehicleTypeUniqueId,
            vt.vehicleTypeName,
            u.fullName, u.phoneNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC`,
    [queueOrganizationUniqueId, queueDate],
  );

  const byType = {};
  for (const row of rows) {
    const typeName = row.vehicleTypeName || row.vehicleTypeUniqueId || "Unknown";
    if (!byType[typeName]) byType[typeName] = [];
    byType[typeName].push(publicEntry(row));
  }

  return {
    message: "Query results fetched",
    data: {
      queueOrganization: org,
      queueDate,
      totalWaiting: rows.filter((r) => r.status === "waiting").length,
      queues: byType,
    },
  };
};

/**
 * QueueOrgAdmin manually checks a driver/vehicle into the queue.
 */
exports.manualCheckin = async (data) => {
  const { queueOrganizationUniqueId, vehicleDriverUniqueId, queueNumber, user } = data;
  const executor = db();

  await queueOrgReady(executor, queueOrganizationUniqueId);
  const vehicleDriver = await getVehicleDriverType(executor, vehicleDriverUniqueId);
  const queueDate = today();

  // FENCE: driver can only be in ONE queue system-wide per day. Removed/loaded
  // entries are free, so re-checkin revives the same-org entry instead of
  // colliding with the (vehicleDriverUniqueId, org, date) unique key.
  const { active, atOrg } = await getDriverQueueState(
    executor,
    vehicleDriver.driverUserUniqueId,
    queueDate,
    queueOrganizationUniqueId,
  );
  if (active) {
    // Idempotent: already in a queue today — return the existing entry.
    return {
      message: "success",
      data: { queueUniqueId: active.queueUniqueId, queueNumber: active.queueNumber, status: active.status },
    };
  }

  let queueUniqueId;
  let assignedNumber;
  if (atOrg) {
    // Re-check-in: revive the previous entry for the same org + day.
    assignedNumber =
      queueNumber ||
      (await nextQueueNumber(
        executor,
        queueOrganizationUniqueId,
        queueDate,
        vehicleDriver.vehicleTypeUniqueId,
      ));
    queueUniqueId = atOrg.queueUniqueId;
    await executor.query(
      `UPDATE DriverQueue
       SET status = 'waiting', queueNumber = ?, joinedAt = ?,
           offeredAt = NULL, loadedAt = NULL, shipperRequestUniqueId = NULL,
           queueUpdatedAt = ?, queueUpdatedBy = ?
       WHERE queueId = ?`,
      [assignedNumber, currentDate(), currentDate(), user.userUniqueId, atOrg.queueId],
    );
  } else {
    assignedNumber =
      queueNumber ||
      (await nextQueueNumber(
        executor,
        queueOrganizationUniqueId,
        queueDate,
        vehicleDriver.vehicleTypeUniqueId,
      ));

    queueUniqueId = uuidv4();
    try {
      await executor.query(
        `INSERT INTO DriverQueue
          (queueUniqueId, queueOrganizationUniqueId, queueDate, queueNumber,
           vehicleDriverUniqueId, joinedAt, status, queueCreatedBy)
         VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)`,
        [
          queueUniqueId,
          queueOrganizationUniqueId,
          queueDate,
          assignedNumber,
          vehicleDriverUniqueId,
          currentDate(),
          user.userUniqueId,
        ],
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") {
        throw new AppError("Driver is already in the queue for this day", 409);
      }
      throw error;
    }
  }

  await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });
  notifyQueueOrgAdmins({ queueOrganizationUniqueId });

  return {
    message: "success",
    data: { queueUniqueId, queueNumber: assignedNumber, status: "waiting" },
  };
};

/**
 * Supervisor override — reorder a queue entry. Audit logged.
 */
exports.overrideEntry = async (queueUniqueId, body, user) => {
  const executor = db();
  const { queueNumber, reason } = body;

  const [rows] = await executor.query(
    `SELECT queueId, queueOrganizationUniqueId, queueDate FROM DriverQueue
     WHERE queueUniqueId = ? AND queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", 404);
  }

  await executor.query(
    `UPDATE DriverQueue SET queueNumber = ?, queueUpdatedAt = ?, queueUpdatedBy = ?
     WHERE queueId = ?`,
    [queueNumber, currentDate(), user.userUniqueId, rows[0].queueId],
  );

  await executor.query(
    `INSERT INTO QueueAuditLog
      (queueAuditUniqueId, queueOrganizationUniqueId, queueDate, queueUniqueId,
       action, beforeValue, afterValue, reason, performedBy)
     VALUES (?, ?, ?, ?, 'override', ?, ?, ?, ?)`,
    [
      uuidv4(),
      rows[0].queueOrganizationUniqueId,
      rows[0].queueDate,
      rows[0].queueUniqueId,
      JSON.stringify({ queueNumber: rows[0].queueNumber }),
      JSON.stringify({ queueNumber }),
      reason || null,
      user.userUniqueId,
    ],
  );

  await emitQueueSnapshot({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    queueDate: rows[0].queueDate,
  });

  return { message: "success", data: { queueUniqueId, queueNumber } };
};

/**
 * Remove a queue entry (no-show / override / checkout by admin).
 */
exports.removeEntry = async (queueUniqueId, user) => {
  const executor = db();

  const [rows] = await executor.query(
    `SELECT queueId, queueOrganizationUniqueId, queueDate, vehicleDriverUniqueId, queueUniqueId
     FROM DriverQueue WHERE queueUniqueId = ? AND queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", 404);
  }

  await executor.query(
    `UPDATE DriverQueue SET status = 'removed', queueUpdatedAt = ?, queueUpdatedBy = ?
     WHERE queueId = ?`,
    [currentDate(), user.userUniqueId, rows[0].queueId],
  );

  await executor.query(
    `INSERT INTO QueueAuditLog
      (queueAuditUniqueId, queueOrganizationUniqueId, queueDate, queueUniqueId,
       action, afterValue, performedBy)
     VALUES (?, ?, ?, ?, 'remove', ?, ?)`,
    [
      uuidv4(),
      rows[0].queueOrganizationUniqueId,
      rows[0].queueDate,
      rows[0].queueUniqueId,
      JSON.stringify({ status: "removed" }),
      user.userUniqueId,
    ],
  );

  await emitQueueSnapshot({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    queueDate: rows[0].queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    messageType: "queue_removed",
  });

  return { message: "success", data: { queueUniqueId, status: "removed" } };
};

const getShipperRequest = async (executor, shipperRequestUniqueId) => {
  const [rows] = await executor.query(
    `SELECT * FROM ShipperRequest
     WHERE shipperRequestUniqueId = ? AND shipperRequestDeletedAt IS NULL`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Shipper request not found", 404);
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

  const [orgRows] = await executor.query(
    `SELECT queueOrganizationName, latitude, longitude
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  const org = orgRows[0] || {};
  const driverRequestUniqueId = uuidv4();
  const [inserted] = await executor.query(
    `INSERT INTO DriverRequest
      (driverRequestUniqueId, userUniqueId, originLatitude, originLongitude,
       originPlace, journeyStatusId, driverRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      driverRequestUniqueId,
      driverUserUniqueId,
      org.latitude ?? 0,
      org.longitude ?? 0,
      org.queueOrganizationName || "Queue organization",
      journeyStatusMap.waiting,
      currentDate(),
    ],
  );
  return { driverRequestId: inserted.insertId, driverRequestUniqueId };
};

/**
 * The engine-level offer: create a `JourneyDecision` (requested, decisionBy =
 * shipper) linking the order to the driver's request, and move the order +
 * driver request into `requested` so the existing accept/reject/timeout engine
 * takes over from here.
 */
const createQueueOffer = async (executor, { shipperRequest, driverRequest, user }) => {
  const journeyDecisionUniqueId = uuidv4();
  const now = currentDate();
  await executor.query(
    `INSERT INTO JourneyDecisions
      (journeyDecisionUniqueId, shipperRequestId, driverRequestId, journeyStatusId,
       decisionTime, decisionBy, journeyDecisionCreatedBy, journeyDecisionCreatedAt)
     VALUES (?, ?, ?, ?, ?, 'shipper', ?, ?)`,
    [
      journeyDecisionUniqueId,
      shipperRequest.shipperRequestId,
      driverRequest.driverRequestId,
      journeyStatusMap.requested,
      now,
      user.userUniqueId,
      now,
    ],
  );
  await executor.query(
    `UPDATE ShipperRequest SET journeyStatusId = ?, shipperRequestUpdatedAt = ?, shipperRequestUpdatedBy = ?
     WHERE shipperRequestId = ?`,
    [journeyStatusMap.requested, now, user.userUniqueId, shipperRequest.shipperRequestId],
  );
  await executor.query(
    `UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ?, driverRequestUpdatedBy = ?
     WHERE driverRequestId = ?`,
    [journeyStatusMap.requested, now, user.userUniqueId, driverRequest.driverRequestId],
  );
  return {
    journeyDecisionUniqueId,
    decision: {
      journeyDecisionUniqueId,
      shipperRequestId: shipperRequest.shipperRequestId,
      driverRequestId: driverRequest.driverRequestId,
      driverRequestUniqueId: driverRequest.driverRequestUniqueId,
      journeyStatusId: journeyStatusMap.requested,
      decisionTime: now,
      decisionBy: "shipper",
    },
  };
};

const notifyDriverOfQueueOffer = async ({
  front,
  shipperRequest,
  vehicle,
  offerResult,
}) => {
  if (!front?.phoneNumber) return;
  await sendSocketIONotificationToDriver({
    phoneNumber: front.phoneNumber,
    eventName: "queue",
    message: {
      messageTypes: messageTypes.queue_order_offered,
      message: "New queue order offered",
      status: journeyStatusMap.requested,
      shipper: shipperRequest,
      driver: {
        driver: {
          ...front,
          driverRequestUniqueId: offerResult.decision.driverRequestUniqueId,
        },
        vehicle,
      },
      journey: null,
      decisions: offerResult.decision,
      queue: {
        queueOrganizationUniqueId: front.queueOrganizationUniqueId,
        queueUniqueId: front.queueUniqueId,
        queueNumber: front.queueNumber,
        offerWindowMinutes: QUEUE_OFFER_WINDOW_MINUTES,
      },
    },
  });
};

/**
 * Core offer primitive — mark the FRONT waiting driver of an order's vehicle
 * type as `offered`, link the order, create the JourneyDecision, and notify
 * only that driver over socket. Drivers already holding an active offer
 * elsewhere are skipped past (they keep their position for the next order).
 *
 * With `throwIfNone` (manual dispatch) an empty queue is a 404; with the auto
 * path (handleQueueDispatch / advance) an empty queue just means the order
 * stays waiting — the call returns `{ offered: false }` instead.
 */
const offerToDriver = async ({
  executor,
  queueOrganizationUniqueId,
  queueDate,
  vehicleTypeUniqueId,
  shipperRequestUniqueId,
  afterQueueNumber,
  user,
  throwIfNone = true,
}) => {
  await queueOrgReady(executor, queueOrganizationUniqueId);
  const shipperRequest = await getShipperRequest(executor, shipperRequestUniqueId);

  let after = afterQueueNumber || null;
  while (true) {
    const [front] = await executor.query(
      `SELECT dq.*, vd.driverUserUniqueId, u.phoneNumber, u.fullName
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
       JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
         AND dq.status = 'waiting' AND dq.queueDeletedAt IS NULL
         AND v.vehicleTypeUniqueId = ?
         ${after ? "AND dq.queueNumber > ?" : ""}
       ORDER BY dq.queueNumber ASC LIMIT 1
       FOR UPDATE`,
      after
        ? [queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId, after]
        : [queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId],
    );

    if (front.length === 0) {
      if (throwIfNone) {
        throw new AppError("No waiting driver in this vehicle type's queue", 404);
      }
      return { offered: false, data: null };
    }

    const entry = front[0];
    const driverRequest = await ensureWaitingDriverRequest(
      executor,
      entry.driverUserUniqueId,
      queueOrganizationUniqueId,
    );
    if (!driverRequest) {
      after = entry.queueNumber;
      continue;
    }

    const offerResult = await createQueueOffer(executor, {
      shipperRequest,
      driverRequest,
      user,
    });

    await executor.query(
      `UPDATE DriverQueue SET status = 'offered', offeredAt = ?, shipperRequestUniqueId = ?,
              queueUpdatedAt = ?, queueUpdatedBy = ?
       WHERE queueId = ?`,
      [currentDate(), shipperRequestUniqueId, currentDate(), user.userUniqueId, entry.queueId],
    );

    await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });

    const vehicle = await getDriverVehicle(executor, entry.driverUserUniqueId);
    await notifyDriverOfQueueOffer({ front: entry, shipperRequest, vehicle, offerResult });

    return {
      offered: true,
      data: {
        queueUniqueId: entry.queueUniqueId,
        queueNumber: entry.queueNumber,
        driverUserUniqueId: entry.driverUserUniqueId,
        journeyDecisionUniqueId: offerResult.journeyDecisionUniqueId,
        status: "offered",
      },
    };
  }
};

/**
 * Dispatch — offer the front waiting driver (of the order's vehicle type) the
 * order. This is the MANUAL trigger (QueueOrgAdmin) for a waiting order.
 */
exports.dispatch = async (data) => {
  const { queueOrganizationUniqueId, vehicleTypeUniqueId, shipperRequestUniqueId, user } = data;
  const result = await offerToDriver({
    executor: db(),
    queueOrganizationUniqueId,
    queueDate: today(),
    vehicleTypeUniqueId,
    shipperRequestUniqueId,
    afterQueueNumber: null,
    user,
    throwIfNone: true,
  });
  return { message: "success", ...result };
};

/**
 * AUTO-dispatch — called from the ShipperRequest create flow when an order is
 * placed against a queue-enabled QueueOrganization (body.queueOrganizationUniqueId).
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
  offerToDriver({
    executor: db(),
    queueOrganizationUniqueId,
    queueDate: today(),
    vehicleTypeUniqueId,
    shipperRequestUniqueId,
    afterQueueNumber: null,
    user,
    throwIfNone: false,
  });

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
    user,
    throwIfNone: false,
  });

/**
 * Driver (or shipper, for a queue order) rejects the offer currently held on
 * the order → the entry returns to `waiting` (keeps position) and the ORDER
 * advances to the next driver of the same vehicle type. Pass `driverUserUniqueId`
 * to restrict to a specific driver (driver-side reject); omit it to clear
 * whichever entry holds the order (shipper-side reject).
 */
exports.rejectOffer = async (data) => {
  const { shipperRequestUniqueId, user, driverUserUniqueId } = data;
  const executor = db();

  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.vehicleDriverUniqueId, v.vehicleTypeUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status = 'offered'
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
  await executor.query(
    `UPDATE DriverQueue SET status = 'waiting', offeredAt = NULL, shipperRequestUniqueId = NULL,
            queueUpdatedAt = ?, queueUpdatedBy = ?
     WHERE queueId = ?`,
    [currentDate(), user.userUniqueId, entry.queueId],
  );

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
    shipperRequestUniqueId,
    user,
  });

  return { message: "success", ...next };
};

/**
 * Driver accepts the queue offer → the entry is marked `loaded` (leaves the
 * dispatch line). Called from the accept flow after the JourneyDecision moves
 * to acceptedByDriver.
 */
exports.markEntryLoaded = async ({ shipperRequestUniqueId, userUniqueId }) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT queueId, queueOrganizationUniqueId, queueDate
     FROM DriverQueue
     WHERE shipperRequestUniqueId = ? AND status = 'offered' AND queueDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { updated: false };
  }
  await executor.query(
    `UPDATE DriverQueue SET status = 'loaded', loadedAt = ?, queueUpdatedAt = ?, queueUpdatedBy = ?
     WHERE queueId = ?`,
    [currentDate(), currentDate(), userUniqueId || null, rows[0].queueId],
  );
  await emitQueueSnapshot({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    queueDate: rows[0].queueDate,
  });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: rows[0].queueOrganizationUniqueId,
    messageType: "queue_order_assigned",
  });
  return { updated: true };
};

/**
 * Implicit reject (offer window expired) — find every entry that is still
 * `offered` past the window with a linked order still `requested`, mark the
 * decision + driver request free (implicit reject, driver keeps position), and
 * advance the order. Called by the background automatic-timeout scan. `actor`
 * is the user stamped on the audit trail (the order's creator).
 */
exports.releaseExpiredOffers = async ({ windowMinutes = QUEUE_OFFER_WINDOW_MINUTES } = {}) => {
  const executor = db();
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);

  const [expired] = await executor.query(
    `SELECT dq.queueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.vehicleDriverUniqueId, dq.shipperRequestUniqueId, v.vehicleTypeUniqueId,
            sr.shipperRequestId, sr.shipperRequestCreatedBy,
            dr.driverRequestId, dr.driverRequestUniqueId, jd.journeyDecisionUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN ShipperRequest sr ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
     JOIN DriverRequest dr ON dr.userUniqueId = vd.driverUserUniqueId
       AND dr.journeyStatusId = ?
     JOIN JourneyDecisions jd ON jd.driverRequestId = dr.driverRequestId
       AND jd.shipperRequestId = sr.shipperRequestId
     WHERE dq.status = 'offered' AND dq.queueDeletedAt IS NULL
       AND dq.offeredAt IS NOT NULL AND dq.offeredAt < ?
       AND sr.journeyStatusId = ?
     ORDER BY dq.offeredAt ASC`,
    [journeyStatusMap.requested, cutoff, journeyStatusMap.requested],
  );

  const advanced = [];
  for (const entry of expired) {
    const actor = { userUniqueId: entry.shipperRequestCreatedBy };
    const now = currentDate();

    await executor.query(
      `UPDATE JourneyDecisions SET journeyStatusId = ?, journeyDecisionUpdatedAt = ?, journeyDecisionUpdatedBy = ?,
              isCancellationByDriverSeenByShipper = 'no need to see it'
       WHERE journeyDecisionUniqueId = ?`,
      [journeyStatusMap.rejectedByDriver, now, actor.userUniqueId, entry.journeyDecisionUniqueId],
    );
    await executor.query(
      `UPDATE DriverRequest SET journeyStatusId = ?, driverRequestUpdatedAt = ?, driverRequestUpdatedBy = ?
       WHERE driverRequestId = ?`,
      [journeyStatusMap.waiting, now, actor.userUniqueId, entry.driverRequestId],
    );
    await executor.query(
      `UPDATE DriverQueue SET status = 'waiting', offeredAt = NULL, shipperRequestUniqueId = NULL,
              queueUpdatedAt = ?, queueUpdatedBy = ?
       WHERE queueId = ?`,
      [now, actor.userUniqueId, entry.queueId],
    );

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
      shipperRequestUniqueId: entry.shipperRequestUniqueId,
      user: actor,
    });
    advanced.push({ queueUniqueId: entry.queueUniqueId, ...next });
  }

  return { message: "success", data: { released: advanced.length, advanced } };
};

module.exports = exports;
