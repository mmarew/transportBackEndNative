"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate, minutesAgo } = require("../Utils/CurrentDate");
const { DOMAIN } = require("../Utils/Constants");
const AppError = require("../Utils/AppError");
const { db } = require("./CompanyHelper.service");
const { updateData } = require("../CRUD/Update/Data.update");
const { createData } = require("../CRUD/Create/CreateData");
const {
  emitQueueSnapshot,
  notifyQueueOrgAdmins,
} = require("../Utils/QueueSocket");
const {
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../Utils/Notifications");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const { sendSms } = require("../Utils/smsSender");
const messageTypes = require("../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");
const { createUser } = require("./User.service");
const logger = require("../Utils/logger");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { transactionStorage } = require("../Utils/TransactionContext");

const today = () => new Date().toISOString().slice(0, 10); // eslint-disable-line no-magic-numbers -- YYYY-MM-DD;
const QUEUE_OFFER_WINDOW_MINUTES = 3;
const QUEUE_REFUSAL_LIMIT =
  Number(process.env.QUEUE_REFUSAL_LIMIT) || DOMAIN.DEFAULT_QUEUE_REFUSAL_LIMIT;

// Shared resolver: org → vehicle type via VehicleDriver → Vehicle
/**
 * Verify a QueueOrganization exists and is not soft-deleted.
 * Used as a lightweight guard before queue mutations (offer/dispatch/advance).
 * Does NOT re-check approvalStatus/queueEnabled — those are validated at order creation.
 * @param {object} executor - DB executor (connection or transaction)
 * @param {string} queueOrganizationUniqueId
 * @returns {Promise<object>} the org row
 * @throws {AppError} 404 if not found or deleted
 */
const queueOrgReady = async (executor, queueOrganizationUniqueId) => {
  const [org] = await executor.query(
    `SELECT queueOrganizationUniqueId, approvalStatus, queueEnabled
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [queueOrganizationUniqueId],
  );
  if (org.length === 0) {
    throw new AppError("Queue organization not found", AppError.NOT_FOUND);
  }
  return org[0];
};

/**
 * Resolve a shipper's phone number to a userUniqueId. Reuses the existing
 * createUser registry (same path as takeFromStreet): if the phone is already
 * registered the existing user is returned; otherwise a minimal user is created.
 * Uses requestedFrom "street" so handleExistingUser skips OTP generation.
 */
const resolveShipperUserByPhone = async (phoneNumber, createdBy) => {
  const cleanPhone = String(phoneNumber).trim().replace(/\s/g, "");
  if (!cleanPhone) {
    throw new AppError("Shipper phone number is invalid", AppError.BAD_REQUEST);
  }
  const result = await createUser({
    phoneNumber: cleanPhone,
    fullName: null,
    email: null,
    roleId: 1,
    statusId: 1,
    userRoleStatusDescription: "queue shipper",
    requestedFrom: "street",
    createdBy,
  });
  if (result.message === "error") {
    throw new AppError(result.error || "Failed to resolve shipper from phone", AppError.BAD_REQUEST);
  }
  const userUniqueId = result?.data?.userUniqueId;
  if (!userUniqueId) {
    throw new AppError("Failed to resolve shipper from phone", AppError.BAD_REQUEST);
  }
  return userUniqueId;
};

const getVehicleDriverType = async (executor, vehicleDriverUniqueId) => {
  const [rows] = await executor.query(
    `SELECT vd.driverUserUniqueId, vd.vehicleUniqueId, v.vehicleTypeUniqueId,
            u.phoneNumber, u.fullName
     FROM VehicleDriver vd
     JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
     JOIN Users u   ON u.userUniqueId   = vd.driverUserUniqueId
     WHERE vd.vehicleDriverUniqueId = ? AND vd.assignmentStatus = 'active'
       AND vd.vehicleDriverDeletedAt IS NULL`,
    [vehicleDriverUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError(
      "Active vehicle-driver assignment not found",
      AppError.NOT_FOUND,
    );
  }
  return rows[0];
};

const nextQueueNumber = async (
  executor,
  queueOrganizationUniqueId,
  queueDate,
  vehicleTypeUniqueId,
) => {
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
  targetedShipperUserUUID: row.targetedShipperUserUUID || null,
});

// A driver is still "in queue" while waiting or holding a dispatch offer.
// Removed (cancelled/checked-out) and loaded (dispatched/completed) drivers are
// free to check back in.
const IN_QUEUE_STATUSES = ["waiting", "offered"];

// Journey statuses that mean the driver is still in flight on an order.
// Accepting a queue offer only marks the queue entry `loaded` (which is NOT in
// IN_QUEUE_STATUSES), so without this fence a dispatched driver could re-check
// in and be offered a SECOND order while their first journey is still active.
const ACTIVE_JOURNEY_STATUSES = [
  journeyStatusMap.acceptedByShipper,
  journeyStatusMap.acceptedByDriver,
  journeyStatusMap.goToLoadingPlace,
  journeyStatusMap.loading,
  journeyStatusMap.loaded,
  journeyStatusMap.journeyStarted,
];

const hasActiveJourney = async (executor, driverUserUniqueId) => {
  const [rows] = await executor.query(
    `SELECT jd.journeyDecisionUniqueId, jd.journeyStatusId,
            jd.journeyDecisionCreatedAt,
            dr.driverRequestUniqueId, sr.shipperRequestUniqueId,
            sr.queueOrganizationUniqueId, o.queueOrganizationName
     FROM JourneyDecisions jd
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     LEFT JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     LEFT JOIN QueueOrganization o
       ON o.queueOrganizationUniqueId = sr.queueOrganizationUniqueId
     WHERE dr.userUniqueId = ?
       AND jd.journeyStatusId IN (?, ?, ?, ?, ?, ?)
     LIMIT 1`,
    [driverUserUniqueId, ...ACTIVE_JOURNEY_STATUSES],
  );
  return rows[0] || null;
};

/**
 * Driver's queue entries for today (across all orgs — fence). Returns:
 * - `active`: first entry still in the queue (blocks re-checkin), or null
 * - `atOrg`: existing entry at the target org (revived on re-checkin so the
 *   (vehicleDriverUniqueId, queueOrganizationUniqueId, queueDate) unique key is
 *   reused instead of colliding), or null
 */
const getDriverQueueState = async (
  executor,
  driverUserUniqueId,
  queueDate,
  targetOrgId,
) => {
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
  const atOrg =
    rows.find((r) => r.queueOrganizationUniqueId === targetOrgId) || null;
  return { active, atOrg, rows };
};

/**
 * Driver joins the queue — virtual check-in from anywhere. Server stamps the
 * position per (queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId).
 */
exports.checkin = async (data) => {
  const { queueOrganizationUniqueId, vehicleDriverUniqueId, user } = data;
  const executor = db();

  let targetedShipperUserUUID = null;
  if (data.shipperPhoneNumber) {
    targetedShipperUserUUID = await resolveShipperUserByPhone(
      data.shipperPhoneNumber, user.userUniqueId,
    );
  }

  const org = await queueOrgReady(executor, queueOrganizationUniqueId);
  if (org.approvalStatus !== "approved" || !org.queueEnabled) {
    throw new AppError(
      "Queue organization is not enabled for dispatch",
      AppError.FORBIDDEN,
    );
  }

  const vehicleDriver = await getVehicleDriverType(
    executor,
    vehicleDriverUniqueId,
  );
  const queueDate = today();

  // FENCE: a driver holding an ACTIVE journey (accepted/started, not yet
  // completed or cancelled) cannot join the queue. Accepting a queue offer
  // marks the entry `loaded` but that alone doesn't block re-checkin, so this
  // guard is what prevents double-dispatch while the first order is in flight.
  // Idempotent — instead of failing a re-check-in, report the journey already
  // in flight so the driver app can surface the existing order.
  const activeJourney = await hasActiveJourney(
    executor,
    vehicleDriver.driverUserUniqueId,
  );
  if (activeJourney) {
    return {
      message: "success",
      data: {
        alreadyInJourney: true,
        journeyStatusId: activeJourney.journeyStatusId,
        shipperRequestUniqueId: activeJourney.shipperRequestUniqueId,
        queueOrganizationUniqueId: activeJourney.queueOrganizationUniqueId,
        queueOrganizationName: activeJourney.queueOrganizationName,
        journeyDecisionUniqueId: activeJourney.journeyDecisionUniqueId,
        driverRequestUniqueId: activeJourney.driverRequestUniqueId,
        offeredAt: activeJourney.journeyDecisionCreatedAt,
      },
    };
  }

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
    if (active.queueOrganizationUniqueId !== queueOrganizationUniqueId) {
      // FENCE: the driver is already active in ANOTHER org today. One queue
      // per driver per day system-wide — reject rather than silently return
      // another org's entry.
      throw new AppError(
        "Driver is already in a queue for today — one queue per day",
        AppError.CONFLICT,
      );
    }
    // Idempotent: already in THIS queue today — return the existing entry.
    // Update targetedShipperUserUUID if a new phone number was provided.
    if (targetedShipperUserUUID !== undefined) {
      await updateData({
        tableName: "DriverQueue",
        updateValues: {
          targetedShipperUserUUID: targetedShipperUserUUID || null,
          queueUpdatedAt: currentDate(),
          queueUpdatedBy: user.userUniqueId,
        },
        conditions: { queueId: active.queueId },
      });
    }
    // Notify shipper if a target was set
    if (targetedShipperUserUUID) {
      notifyShipperOfQueueReservation({
        executor,
        targetedShipperUserUUID,
        driverFullName: vehicleDriver.fullName,
        driverPhoneNumber: vehicleDriver.phoneNumber,
        queueOrganizationUniqueId,
        queueNumber: active.queueNumber,
      });
    }
    // Still rescan: the front-driver of this type may be waiting on an order
    // that outlived the queue (empty at creation / all rejected).
    await rescanPendingQueueOrder({
      queueOrganizationUniqueId,
      vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
      user,
    });
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
    // Keep the existing queueNumber so the driver doesn't lose their position.
    queueNumber = atOrg.queueNumber;
    queueUniqueId = atOrg.queueUniqueId;
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "waiting",
        queueNumber,
        queueRefusalCount: 0,
        joinedAt: currentDate(),
        offeredAt: null,
        loadedAt: null,
        shipperRequestUniqueId: null,
        targetedShipperUserUUID: targetedShipperUserUUID || null,
        queueUpdatedAt: currentDate(),
        queueUpdatedBy: user.userUniqueId,
      },
      conditions: { queueId: atOrg.queueId },
    });
  } else {
    queueNumber = await nextQueueNumber(
      executor,
      queueOrganizationUniqueId,
      queueDate,
      vehicleDriver.vehicleTypeUniqueId,
    );

    queueUniqueId = uuidv4();
    try {
      await createData({
        tableName: "DriverQueue",
        insertValues: {
          queueUniqueId,
          queueOrganizationUniqueId,
          queueDate,
          queueNumber,
          vehicleDriverUniqueId,
          targetedShipperUserUUID,
          joinedAt: currentDate(),
          status: "waiting",
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
  }

  // Check-in auto-offer: pair the oldest pending queue order of this driver's
  // vehicle type with the FRONT waiting driver (FIFO, one order per check-in).
  // Runs inside the check-in transaction — the FOR UPDATE lock serializes
  // concurrent check-ins, so one order is never double-offered.
  await rescanPendingQueueOrder({
    queueOrganizationUniqueId,
    vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
    user,
  });

  await emitQueueSnapshot({ queueOrganizationUniqueId, queueDate });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId,
    messageType: "queue_position_changed",
  });

  // Notify shipper if a target was set
  if (targetedShipperUserUUID) {
    notifyShipperOfQueueReservation({
      executor,
      targetedShipperUserUUID,
      driverFullName: vehicleDriver.fullName,
      driverPhoneNumber: vehicleDriver.phoneNumber,
      queueOrganizationUniqueId,
      queueNumber,
    });
  }

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

  // Organization details for the queue the driver is currently in (same fields
  // as GET /api/queue/status so both endpoints agree on the org shape).
  const [orgRows] = await executor.query(
    `SELECT queueOrganizationUniqueId, queueOrganizationName, queueOrganizationType,
            queueOrganizationPhone, queueOrganizationAddress, latitude, longitude,
            approvalStatus, queueEnabled, approvedBy, approvedAt
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0`,
    [orgId],
  );

  // If the driver targeted a shipper, fetch shipper details for the response.
  let shipper = null;
  const targetedId = rows[0].targetedShipperUserUUID;
  if (targetedId) {
    const [shipperRows] = await executor.query(
      `SELECT userUniqueId, fullName, phoneNumber
       FROM Users WHERE userUniqueId = ? AND isDeleted = 0 LIMIT 1`,
      [targetedId],
    );
    shipper = shipperRows[0] || null;
  }

  return {
    message: "success",
    data: {
      queue: {
        ...publicEntry(rows[0]),
        waitingAhead: ahead[0].total,
      },
      shipper,
      organization: orgRows[0] || null,
    },
  };
};

/**
 * Driver leaves the queue (checkout / no-show) — entry marked 'removed'.
 * If queueOrganizationUniqueId provided, scope to that org; otherwise find via fence.
 */
exports.checkout = async (queueOrganizationUniqueId, user) => {
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
  if (rows.length === 0) {
    throw new AppError(
      "Driver is not in the queue for today",
      AppError.NOT_FOUND,
    );
  }

  const orgId = rows[0].queueOrganizationUniqueId;
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "removed",
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
    },
    conditions: { queueId: rows[0].queueId },
  });

  await emitQueueSnapshot({ queueOrganizationUniqueId: orgId, queueDate });
  notifyQueueOrgAdmins({
    queueOrganizationUniqueId: orgId,
    messageType: "queue_removed",
  });

  return {
    message: "success",
    data: { queueUniqueId: rows[0].queueUniqueId, status: "removed" },
  };
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
    throw new AppError("Queue organization not found", AppError.NOT_FOUND);
  }
  const org = orgRows[0];

  const [rows] = await executor.query(
    `SELECT dq.queueUniqueId, dq.queueNumber, dq.joinedAt, dq.status,
            dq.offeredAt, dq.loadedAt, dq.vehicleDriverUniqueId,
            dq.shipperRequestUniqueId, dq.targetedShipperUserUUID,
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
    const typeName =
      row.vehicleTypeName || row.vehicleTypeUniqueId || "Unknown";
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
  const {
    queueOrganizationUniqueId,
    vehicleDriverUniqueId,
    queueNumber,
    user,
  } = data;
  const executor = db();

  let targetedShipperUserUUID = null;
  if (data.shipperPhoneNumber) {
    targetedShipperUserUUID = await resolveShipperUserByPhone(
      data.shipperPhoneNumber, user.userUniqueId,
    );
  }

  await queueOrgReady(executor, queueOrganizationUniqueId);
  const vehicleDriver = await getVehicleDriverType(
    executor,
    vehicleDriverUniqueId,
  );
  const queueDate = today();

  // FENCE: a driver holding an ACTIVE journey (accepted/started, not yet
  // completed or cancelled) cannot be force-checked in — their previous queue
  // order is still in flight.
  if (await hasActiveJourney(executor, vehicleDriver.driverUserUniqueId)) {
    throw new AppError(
      "Driver has an active journey — finish or cancel it before joining the queue",
      AppError.CONFLICT,
    );
  }

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
    if (active.queueOrganizationUniqueId !== queueOrganizationUniqueId) {
      // FENCE: driver already active in another org today.
      throw new AppError(
        "Driver is already in a queue for today — one queue per day",
        AppError.CONFLICT,
      );
    }
    // Idempotent: already in THIS queue today — return the existing entry.
    return {
      message: "success",
      data: {
        queueUniqueId: active.queueUniqueId,
        queueNumber: active.queueNumber,
        status: active.status,
      },
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
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "waiting",
        queueNumber: assignedNumber,
        joinedAt: currentDate(),
        offeredAt: null,
        loadedAt: null,
        shipperRequestUniqueId: null,
        targetedShipperUserUUID: targetedShipperUserUUID || null,
        queueUpdatedAt: currentDate(),
        queueUpdatedBy: user.userUniqueId,
      },
      conditions: { queueId: atOrg.queueId },
    });
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
      await createData({
        tableName: "DriverQueue",
        insertValues: {
          queueUniqueId,
          queueOrganizationUniqueId,
          queueDate,
          queueNumber: assignedNumber,
          vehicleDriverUniqueId,
          targetedShipperUserUUID,
          joinedAt: currentDate(),
          status: "waiting",
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
    `SELECT queueId, queueOrganizationUniqueId, queueDate, queueNumber, queueUniqueId FROM DriverQueue
     WHERE queueUniqueId = ? AND queueDeletedAt IS NULL`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }

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
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }

  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "removed",
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
      action: "remove",
      afterValue: JSON.stringify({ status: "removed" }),
      performedBy: user.userUniqueId,
    },
  });

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

const notifyDriverOfQueueOffer = async ({
  front,
  shipperRequest,
  vehicle,
  offerResult,
}) => {
  if (!front?.phoneNumber) return;
  // FCM — wakes the driver's phone even when the app is backgrounded, so a
  // queue placement rings like a company assignment / nearby-match offer
  // instead of being silently missed. Best-effort: the socket is the primary
  // path, and the driver app's REST myPosition poll recovers the offer anyway.
  sendFCMNotificationToUser({
    userUniqueId: front.driverUserUniqueId,
    roleId: usersRoles.driverRoleId,
    notification: {
      title: "New queue order offered",
      body: shipperRequest?.originPlace
        ? `You have a new queue order from ${shipperRequest.originPlace}. Please accept or reject.`
        : "You have a new queue order. Please accept or reject.",
    },
    data: {
      type: "queue_order_offered",
      queueOrganizationUniqueId: front.queueOrganizationUniqueId,
      queueUniqueId: front.queueUniqueId,
      queueNumber: String(front.queueNumber ?? ""),
      shipperRequestUniqueId: shipperRequest.shipperRequestUniqueId,
      journeyDecisionUniqueId: offerResult.decision.journeyDecisionUniqueId,
    },
  }).catch((e) =>
    logger.error("FCM failed for queue offer notification", {
      error: e.message,
      driverUserUniqueId: front.driverUserUniqueId,
      queueUniqueId: front.queueUniqueId,
    }),
  );

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
 * Push a `queue` socket event to the SHIPPER who owns a queue order. The
 * shipper is resolved via `ShipperRequest.shipperRequestCreatedBy → Users`.
 * Mirrors `notifyDriverOfQueueOffer`; the bid flow already uses this helper
 * (`sendSocketIONotificationToShipper`). Best-effort: offline shipper or an
 * order created by a queue admin (no `shipper` socket) is skipped silently —
 * the QueueOrgAdmin rooms still get the snapshot push.
 */
const notifyShipperOfQueueEvent = async ({
  executor,
  shipperRequestUniqueId,
  messageType,
  message,
  data = {},
}) => {
  try {
    const [rows] = await executor.query(
      `SELECT u.phoneNumber, u.fullName
       FROM ShipperRequest sr
       JOIN Users u ON u.userUniqueId = sr.shipperRequestCreatedBy
       WHERE sr.shipperRequestUniqueId = ? AND sr.shipperRequestDeletedAt IS NULL`,
      [shipperRequestUniqueId],
    );
    const shipper = rows[0];
    if (!shipper?.phoneNumber) return;
    await sendSocketIONotificationToShipper({
      phoneNumber: shipper.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes[messageType],
        message,
        shipperRequestUniqueId,
        shipper: {
          fullName: shipper.fullName,
          phoneNumber: shipper.phoneNumber,
        },
        ...data,
      },
    });
  } catch (error) {
    logger.error("notifyShipperOfQueueEvent failed", {
      error: error.message,
      shipperRequestUniqueId,
    });
  }
};

/**
 * Notify a shipper that a driver has reserved their queue position exclusively
 * for the shipper's orders. Best-effort: socket + FCM + SMS, failures are
 * logged but never block the checkin.
 */
const notifyShipperOfQueueReservation = async ({
  executor,
  targetedShipperUserUUID,
  driverFullName,
  driverPhoneNumber,
  queueOrganizationUniqueId,
  queueNumber,
}) => {
  if (!targetedShipperUserUUID) return;
  try {
    const [rows] = await executor.query(
      `SELECT phoneNumber, fullName FROM Users WHERE userUniqueId = ? AND isDeleted = 0 LIMIT 1`,
      [targetedShipperUserUUID],
    );
    const shipper = rows[0];
    if (!shipper?.phoneNumber) return;

    // Socket notification
    sendSocketIONotificationToShipper({
      phoneNumber: shipper.phoneNumber,
      eventName: "queue",
      message: {
        messageTypes: messageTypes.queue_position_reserved,
        message: "A driver has reserved their queue position for your orders",
        data: {
          targetedShipperUserUUID,
          driverFullName,
          driverPhoneNumber,
          queueOrganizationUniqueId,
          queueNumber,
        },
      },
    }).catch((e) =>
      logger.error("Socket notification failed for queue reservation", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );

    // FCM notification
    sendFCMNotificationToUser({
      userUniqueId: targetedShipperUserUUID,
      roleId: usersRoles.shipperRoleId,
      notification: {
        title: "Queue position reserved",
        body: driverFullName
          ? `Driver ${driverFullName} has reserved their queue position for your orders.`
          : "A driver has reserved their queue position for your orders.",
      },
      data: {
        type: "queue_position_reserved",
        targetedShipperUserUUID,
        driverFullName,
        driverPhoneNumber,
        queueOrganizationUniqueId,
        queueNumber: String(queueNumber ?? ""),
      },
    }).catch((e) =>
      logger.error("FCM failed for queue reservation notification", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );

    // SMS notification
    sendSms(
      shipper.phoneNumber,
      null,
      `A driver has reserved their queue position for your orders. Driver: ${driverFullName || "N/A"}, Phone: ${driverPhoneNumber || "N/A"}.`,
    ).catch((e) =>
      logger.error("SMS failed for queue reservation notification", {
        error: e.message,
        targetedShipperUserUUID,
      }),
    );
  } catch (error) {
    logger.error("notifyShipperOfQueueReservation failed", {
      error: error.message,
      targetedShipperUserUUID,
    });
  }
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
 *
 * A driver who has already rejected (or cancelled, or had admin-cancelled)
 * this exact order is skipped by the front-driver query — the order advances
 * to the next waiting driver who hasn't refused it.
 */
const offerToDriver = async ({
  executor,
  queueOrganizationUniqueId,
  queueDate,
  vehicleTypeUniqueId,
  shipperRequestUniqueId,
  afterQueueNumber,
  excludeVehicleDriverUniqueId,
  user,
  throwIfNone = true,
}) => {
  await queueOrgReady(executor, queueOrganizationUniqueId);
  const shipperRequest = await getShipperRequest(
    executor,
    shipperRequestUniqueId,
  );

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
    const [front] = await txExecutor.query(
      `SELECT dq.*, vd.driverUserUniqueId, u.phoneNumber, u.fullName
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
         AND dq.status = 'waiting' AND dq.queueDeletedAt IS NULL
         AND v.vehicleTypeUniqueId = ?
         ${after ? "AND dq.queueNumber > ?" : ""}
         ${excludeVehicleDriverUniqueId ? "AND dq.vehicleDriverUniqueId <> ?" : ""}
         AND NOT EXISTS (
           SELECT 1 FROM JourneyDecisions jd
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE jd.shipperRequestId = ?
             AND dr.userUniqueId = vd.driverUserUniqueId
             AND jd.journeyStatusId IN (?, ?, ?, ?)
         )
       ORDER BY dq.queueNumber ASC LIMIT 1
       FOR UPDATE`,
      after
        ? excludeVehicleDriverUniqueId
          ? [
              queueOrganizationUniqueId,
              queueDate,
              vehicleTypeUniqueId,
              after,
              excludeVehicleDriverUniqueId,
              ...skipRejectedParams,
            ]
          : [
              queueOrganizationUniqueId,
              queueDate,
              vehicleTypeUniqueId,
              after,
              ...skipRejectedParams,
            ]
        : excludeVehicleDriverUniqueId
          ? [
              queueOrganizationUniqueId,
              queueDate,
              vehicleTypeUniqueId,
              excludeVehicleDriverUniqueId,
              ...skipRejectedParams,
            ]
          : [
              queueOrganizationUniqueId,
              queueDate,
              vehicleTypeUniqueId,
              ...skipRejectedParams,
            ],
    );

    if (front.length === 0) {
      if (throwIfNone) {
        throw new AppError(
          "No waiting driver in this vehicle type's queue",
          AppError.NOT_FOUND,
        );
      }
      return { offered: false, data: null };
    }

    const entry = front[0];

    // EXCLUSIVE RESERVATION: if this driver targeted a specific shipper via
    // phone at check-in, only offer them orders from that shipper. Skip to
    // the next driver in FIFO otherwise.
    if (
      entry.targetedShipperUserUUID &&
      shipperRequest.userUniqueId !== entry.targetedShipperUserUUID
    ) {
      after = entry.queueNumber;
      continue;
    }

    const driverRequest = await ensureWaitingDriverRequest(
      txExecutor,
      entry.driverUserUniqueId,
      queueOrganizationUniqueId,
    );
    if (!driverRequest) {
      after = entry.queueNumber;
      continue;
    }

    const offerResult = await createQueueOffer(txExecutor, {
      shipperRequest,
      driverRequest,
      user,
    });

    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "offered",
        offeredAt: currentDate(),
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
  const {
    queueOrganizationUniqueId,
    vehicleTypeUniqueId,
    shipperRequestUniqueId,
    user,
  } = data;
  const result = await executeInTransaction(
    () =>
      offerToDriver({
        executor: db(),
        queueOrganizationUniqueId,
        queueDate: today(),
        vehicleTypeUniqueId,
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
 * `handleQueueDispatch` marks the front driver `offered`, so the next iteration
 * advances to the next driver — a single check-in can therefore fill several
 * free slots when the org has a backlog.
 *
 * Runs inside the check-in's transaction: `executeInTransaction` reuses the
 * outer connection, so the front-driver `FOR UPDATE` lock serializes concurrent
 * check-ins and the same order cannot be double-offered.
 * Best-effort — returns `{ offered: false, data: null }` when nothing pending.
 */
const rescanPendingQueueOrder = async ({
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
  user,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT sr.shipperRequestUniqueId
     FROM ShipperRequest sr
     WHERE sr.queueOrganizationUniqueId = ?
       AND sr.vehicleTypeUniqueId = ?
       AND sr.requestMode <> 'company_target'
       AND sr.journeyStatusId IN (?, ?)
       AND sr.shipperRequestDeletedAt IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM DriverQueue dq
         WHERE dq.shipperRequestUniqueId = sr.shipperRequestUniqueId
           AND dq.status = 'offered'
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
    const result = await exports.handleQueueDispatch({
      queueOrganizationUniqueId,
      vehicleTypeUniqueId,
      shipperRequestUniqueId: row.shipperRequestUniqueId,
      user,
    });
    if (result?.offered) {
      return result;
    }
  }
  return { offered: false, data: null };
};

// Safety cap per sweep so a pathological backlog can never loop forever.
const MAX_OFFERS_PER_SWEEP = 50;

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
     WHERE dq.queueDate = ? AND dq.status = 'waiting' AND dq.queueDeletedAt IS NULL
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

/**
 * Any rejection of a queue order's offer — driver-side or shipper-side (shipper
 * rejects the driver's quoted price) — returns the entry to `waiting` (keeps
 * position), advances the ORDER to the next driver of the same vehicle type, and
 * counts one penalty point toward the driver's refusal limit
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
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "waiting",
      offeredAt: null,
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
 * line). Idempotent: no-op unless the entry is still 'loaded' and holding the
 * completed order. Called from completeJourney after the transaction commits.
 */
exports.closeEntryOnJourneyCompletion = async ({
  shipperRequestUniqueId,
  userUniqueId,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate
     FROM DriverQueue
     WHERE shipperRequestUniqueId = ? AND status = 'loaded'
       AND queueDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { closed: false };
  }

  const entry = rows[0];
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
 * If an entry is currently holding the cancelled order's offer (`offered`),
 * release it back to `waiting` in place (position preserved, `queueNumber`
 * untouched) without counting a refusal and without advancing the order (there
 * is no next driver — the order is gone). No-op for non-queue orders and for
 * entries already `waiting`/`loaded`. Idempotent.
 */
exports.releaseEntryOnOrderCancel = async ({
  shipperRequestUniqueId,
  user,
}) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueNumber, dq.queueOrganizationUniqueId, dq.queueDate,
            dq.vehicleDriverUniqueId, vd.driverUserUniqueId
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status = 'offered'
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC LIMIT 1
     FOR UPDATE`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { released: false };
  }

  const entry = rows[0];
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "waiting",
      offeredAt: null,
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
 * Driver accepts the queue offer → the entry is marked `loaded` (leaves the
 * dispatch line). Called from the accept flow after the JourneyDecision moves
 * to acceptedByDriver.
 */
exports.markEntryLoaded = async ({ shipperRequestUniqueId, userUniqueId }) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueOrganizationUniqueId, dq.queueDate,
            u.fullName AS driverName, u.phoneNumber AS driverPhoneNumber,
            v.licensePlate, vt.vehicleTypeName
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId         = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId    = v.vehicleTypeUniqueId
     WHERE dq.shipperRequestUniqueId = ? AND dq.status = 'offered' AND dq.queueDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestUniqueId],
  );
  if (rows.length === 0) {
    return { updated: false };
  }
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "loaded",
      loadedAt: currentDate(),
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
 * `offered` past the window with a linked order still `requested`, mark the
 * decision + driver request free (implicit reject, driver keeps position), and
 * advance the order. Called by the background automatic-timeout scan. `actor`
 * is the user stamped on the audit trail (the order's creator).
 */
exports.releaseExpiredOffers = async ({
  windowMinutes = QUEUE_OFFER_WINDOW_MINUTES,
} = {}) => {
  const executor = db();
  // `offeredAt` is written by `currentDate()` as EAT wall-clock; compare against
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
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "waiting",
        offeredAt: null,
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

module.exports = exports;
