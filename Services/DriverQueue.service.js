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

const today = () => new Date().toISOString().slice(0, 10);

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
  const queueNumber = await nextQueueNumber(
    executor,
    queueOrganizationUniqueId,
    queueDate,
    vehicleDriver.vehicleTypeUniqueId,
  );

  const queueUniqueId = uuidv4();
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
 */
exports.myPosition = async (queueOrganizationUniqueId, user) => {
  const executor = db();
  const queueDate = today();

  const [rows] = await executor.query(
    `SELECT dq.*, vd.driverUserUniqueId, v.vehicleTypeUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber DESC LIMIT 1`,
    [queueOrganizationUniqueId, queueDate, user.userUniqueId],
  );

  if (rows.length === 0) {
    throw new AppError("Driver is not in the queue for today", 404);
  }

  const [ahead] = await executor.query(
    `SELECT COUNT(*) AS total
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND v.vehicleTypeUniqueId = ? AND dq.status = 'waiting'
       AND dq.queueNumber < ? AND dq.queueDeletedAt IS NULL`,
    [
      queueOrganizationUniqueId,
      queueDate,
      rows[0].vehicleTypeUniqueId,
      rows[0].queueNumber,
    ],
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
 */
exports.checkout = async (queueOrganizationUniqueId, user) => {
  const executor = db();
  const queueDate = today();

  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND vd.driverUserUniqueId = ? AND dq.status != 'removed'
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber DESC LIMIT 1`,
    [queueOrganizationUniqueId, queueDate, user.userUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Driver is not in the queue for today", 404);
  }

  await executor.query(
    `UPDATE DriverQueue SET status = 'removed', queueUpdatedAt = ?, queueUpdatedBy = ?
     WHERE queueId = ?`,
    [currentDate(), user.userUniqueId, rows[0].queueId],
  );

  await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });
  notifyQueueOrgAdmins({ queueOrganizationUniqueId, messageType: "queue_removed" });

  return { message: "success", data: { queueUniqueId: rows[0].queueUniqueId, status: "removed" } };
};

/**
 * Full queue for an org+day, grouped by vehicle type — the dispute truth.
 */
exports.getQueueStatus = async (queueOrganizationUniqueId, query) => {
  const executor = db();
  const queueDate = query.queueDate || today();

  const [rows] = await executor.query(
    `SELECT dq.queueUniqueId, dq.queueNumber, dq.joinedAt, dq.status,
            dq.offeredAt, dq.loadedAt, dq.vehicleDriverUniqueId,
            dq.shipperRequestUniqueId,
            vd.driverUserUniqueId, v.vehicleTypeUniqueId,
            u.fullName, u.phoneNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC`,
    [queueOrganizationUniqueId, queueDate],
  );

  const byType = {};
  for (const row of rows) {
    const type = row.vehicleTypeUniqueId || "unknown";
    if (!byType[type]) byType[type] = [];
    byType[type].push(publicEntry(row));
  }

  return {
    message: "Query results fetched",
    data: {
      queueOrganizationUniqueId,
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

  const assignedNumber =
    queueNumber ||
    (await nextQueueNumber(
      executor,
      queueOrganizationUniqueId,
      queueDate,
      vehicleDriver.vehicleTypeUniqueId,
    ));

  const queueUniqueId = uuidv4();
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

/**
 * Dispatch — offer the front waiting driver (of the order's vehicle type) the
 * order. Links the ShipperRequest and notifies only that driver over socket.
 * Auto-advance on reject/timeout is wired via ShipperRequest create flow
 * (handleQueueDispatch); this is the manual trigger for a waiting order.
 */
exports.dispatch = async (data) => {
  const { queueOrganizationUniqueId, vehicleTypeUniqueId, shipperRequestUniqueId, user } = data;
  const executor = db();

  await queueOrgReady(executor, queueOrganizationUniqueId);

  const [front] = await executor.query(
    `SELECT dq.*, vd.driverUserUniqueId, u.phoneNumber
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.status = 'waiting' AND dq.queueDeletedAt IS NULL
       AND v.vehicleTypeUniqueId = ?
     ORDER BY dq.queueNumber ASC LIMIT 1
     FOR UPDATE`,
    [queueOrganizationUniqueId, today(), vehicleTypeUniqueId],
  );

  if (front.length === 0) {
    throw new AppError("No waiting driver in this vehicle type's queue", 404);
  }

  const queueDate = today();
  await executor.query(
    `UPDATE DriverQueue SET status = 'offered', offeredAt = ?, shipperRequestUniqueId = ?,
            queueUpdatedAt = ?, queueUpdatedBy = ?
     WHERE queueId = ?`,
    [currentDate(), shipperRequestUniqueId || null, currentDate(), user.userUniqueId, front[0].queueId],
  );

  await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });

  if (front[0].phoneNumber) {
    await sendSocketIONotificationToDriver({
      phoneNumber: front[0].phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes.queue_order_offered,
        data: {
          queueUniqueId: front[0].queueUniqueId,
          shipperRequestUniqueId: shipperRequestUniqueId || null,
          offerWindowMinutes: 3,
        },
      },
    });
  }

  return {
    message: "success",
    data: {
      queueUniqueId: front[0].queueUniqueId,
      queueNumber: front[0].queueNumber,
      driverUserUniqueId: front[0].driverUserUniqueId,
      status: "offered",
    },
  };
};

module.exports = exports;
