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
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../../CRUD/Read/ReadData");
const { createUser } = require("../User.service");
const logger = require("../../Utils/logger");
const { listOfDocumentsTypeAndId } = require("../../Utils/ListOfSeedData");
const {
  today,
  queueOrgReady,
  logQueueHistory,
  getVehicleDriverType,
  nextQueueNumber,
  publicEntry,
  IN_QUEUE_STATUSES,
  ACTIVE_JOURNEY_STATUSES,
} = require("./helpers");
const {
  rescanPendingQueueOrder,
  notifyShipperOfQueueReservation,
} = require("./dispatch");
const {
  getQueueStatus,
  manualCheckin,
  overrideEntry,
  removeEntry,
} = require("./queue-admin");

const validateCheckinDistance = async (executor, org, driverLat, driverLng) => {
  if (!org.checkinRadiusKm || org.latitude === null || org.longitude === null) {
    return null; // no radius enforced
  }
  if (driverLat === null || driverLng === null) {
    throw new AppError(
      `Location required — this organization requires check-in within ${org.checkinRadiusKm}km`,
      AppError.BAD_REQUEST,
    );
  }
  const [[row]] = await executor.query(
    `SELECT (
      6371 * 2 * ASIN(SQRT(
        POWER(SIN(RADIANS(? - ?) / 2), 2) +
        COS(RADIANS(?)) * COS(RADIANS(?)) *
        POWER(SIN(RADIANS(? - ?) / 2), 2))
      )
    ) AS distanceKm`,
    [
      Number(driverLat),
      Number(org.latitude),
      Number(org.latitude),
      Number(org.latitude),
      Number(driverLng),
      Number(org.longitude),
    ],
  );
  const distanceKm = Number(row.distanceKm);
  if (distanceKm > org.checkinRadiusKm) {
    throw new AppError(
      `Too far from queue organization — ${distanceKm.toFixed(1)}km away, max allowed is ${org.checkinRadiusKm}km`,
      AppError.BAD_REQUEST,
    );
  }
  return distanceKm;
};

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
    throw new AppError(
      result.error || "Failed to resolve shipper from phone",
      AppError.BAD_REQUEST,
    );
  }
  const userUniqueId = result?.data?.userUniqueId;
  if (!userUniqueId) {
    throw new AppError(
      "Failed to resolve shipper from phone",
      AppError.BAD_REQUEST,
    );
  }
  return userUniqueId;
};

/**
 * Whether the driver currently holds an ACTIVE engagement that blocks a new
 * check-in.
 *
 * Covers both an unsettled queue offer (JourneyDecision status `requested`) and
 * an in-flight journey (statuses acceptedByDriver → journeyStarted). While one
 * exists the driver cannot re-check-in / be force-checked-in: the queue entry
 * carrying the offer must not be retired (soft-deleted) because that orphans
 * the offer and leaves both the driver and the order stuck. The driver app is
 * told to cancel/accept the existing connection first.
 *
 * @param {*} executor - DB executor (connection or transaction)
 * @param {string} driverUserUniqueId - The driver / user UUID
 * @returns {Promise<Object|null>} The in-flight journey info, or null when free
 */
const hasActiveJourney = async (executor, driverUserUniqueId) => {
  const [rows] = await executor.query(
    `SELECT jd.journeyDecisionUniqueId, jd.journeyStatusId,
            jd.journeyDecisionCreatedAt,
            dr.driverRequestUniqueId, sr.shipperRequestUniqueId,
            srb.queueOrganizationUniqueId, o.queueOrganizationName
     FROM JourneyDecisions jd
     JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
     LEFT JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
     LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
     LEFT JOIN QueueOrganization o
       ON o.queueOrganizationUniqueId = srb.queueOrganizationUniqueId
     WHERE dr.userUniqueId = ?
       AND jd.journeyStatusId IN (?, ?, ?, ?, ?, ?, ?)
     LIMIT 1`,
    [driverUserUniqueId, ...ACTIVE_JOURNEY_STATUSES],
  );
  return rows[0] || null;
};

/**
 * Driver's queue entries for today (across all orgs — fence). Returns:
 * - `active`: first entry still in the queue (blocks re-checkin in another
 *   org), or null. Any non-deleted row with an in-queue status counts.
 * - `atOrg`: the latest live (non-removed, non-deleted) entry at the target
 *   org, or null. This is the entry that re-check-in RETIRES (soft-deletes)
 *   before inserting a brand-new row, so it is always the newest one at the
 *   org — there is intentionally no unique key on (vehicle, org, day).
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
     WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueId DESC`,
    [queueDate, driverUserUniqueId],
  );
  const active = rows.find((r) => IN_QUEUE_STATUSES.includes(r.status)) || null;
  const atOrg =
    rows.find(
      (r) =>
        r.queueOrganizationUniqueId === targetOrgId && r.status !== "removed",
    ) || null;
  return { active, atOrg, rows };
};

/**
 * Driver joins the queue — virtual check-in from anywhere. Server stamps the
 * position per (queueOrganizationUniqueId, queueDate, vehicleTypeUniqueId).
 *
 * Flow:
 * 1. Resolve optional shipperPhoneNumber → targetedShipperUserUUID
 * 2. Verify org exists, is approved, and queueEnabled
 * 3. Validate driver proximity to org (if org has checkinRadiusKm set)
 * 4. Fence: reject if driver has an active engagement = an UNRESOLVED queue
 *    offer (status 2 = requested) or an in-flight journey (status 4,3,5,6,7,8).
 *    A driver holding either is told "active journey — cancel/accept first" so
 *    the fence never orphans a live offer by soft-deleting its queue entry.
 * 5. Fence: one ACTIVE queue per driver per day system-wide (other-org → 409)
 * 6. Re-check-in creates BRAND-NEW data: if the driver already has an entry at
 *    this org today (active or leftover), soft-delete it (status 'removed') and
 *    insert a fresh row with a NEW queueUniqueId and a NEW back-of-line
 *    queueNumber. The shipper reservation is freed and re-applied only when a
 *    new phone is provided. Every check-in therefore yields unique queue data.
 * 7. Auto-dispatch: try to match oldest pending order of this vehicle type
 *
 * @param {object} data
 * @param {string} data.queueOrganizationUniqueId - FK → QueueOrganization
 * @param {string} data.vehicleDriverUniqueId - FK → VehicleDriver
 * @param {object} data.user - Authenticated user from JWT (req.user)
 * @param {number|null} [data.latitude] - Driver's GPS latitude (required if org has checkinRadiusKm)
 * @param {number|null} [data.longitude] - Driver's GPS longitude (required if org has checkinRadiusKm)
 * @param {string|null} [data.shipperPhoneNumber] - Shipper's phone to reserve this position for
 * @returns {Promise<object>} Queue entry details (queueUniqueId, queueNumber, etc.)
 * @throws {AppError} 403 if org not approved or not enabled
 * @throws {AppError} 400 if location required but not provided, or if too far from org
 * @throws {AppError} 409 if driver is already in another queue today
 * @throws {AppError} 409 if the driver holds an active request/in-flight journey
 * @throws {AppError} 404 if org not found
 */
exports.checkin = async (data) => {
  const { queueOrganizationUniqueId, vehicleDriverUniqueId, user } = data;
  const driverLatitude = data.latitude ?? null;
  const driverLongitude = data.longitude ?? null;
  const executor = db();

  let targetedShipperUserUUID = null;
  if (data.shipperPhoneNumber) {
    targetedShipperUserUUID = await resolveShipperUserByPhone(
      data.shipperPhoneNumber,
      user.userUniqueId,
    );
  }

  const org = await queueOrgReady(executor, queueOrganizationUniqueId);
  if (org.approvalStatus !== "approved" || !org.queueEnabled) {
    throw new AppError(
      "Queue organization is not enabled for dispatch",
      AppError.FORBIDDEN,
    );
  }

  await validateCheckinDistance(executor, org, driverLatitude, driverLongitude);

  const vehicleDriver = await getVehicleDriverType(
    executor,
    vehicleDriverUniqueId,
  );
  const queueDate = today();

  // FENCE: a driver holding an ACTIVE engagement cannot join the queue. This
  // covers both an UNRESOLVED queue offer (status 2 = requested) and an
  // in-flight journey (accepted/started, not yet completed or cancelled).
  // Without it a re-check-in would retire the queue entry carrying the live
  // offer and orphan it (the driver's `requested` DriverRequest blocks fresh
  // offers while the order stays stuck in `requested`). Idempotent — instead
  // of failing, report the journey already in flight so the driver app can
  // surface / cancel the existing connection first.
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
        requestedAt: activeJourney.journeyDecisionCreatedAt,
      },
    };
  }

  // FENCE: driver can only be in ONE ACTIVE queue system-wide per day; an
  // active entry in a different org is rejected below. Re-check-in at the same
  // org retires the prior entry and inserts a brand-new row (fresh queueUniqueId),
  // so there is no unique key on (vehicleDriverUniqueId, org, date).
  const { active, atOrg } = await getDriverQueueState(
    executor,
    vehicleDriver.driverUserUniqueId,
    queueDate,
    queueOrganizationUniqueId,
  );
  if (
    active &&
    active.queueOrganizationUniqueId !== queueOrganizationUniqueId
  ) {
    // FENCE: the driver is already active in ANOTHER org today. One queue
    // per driver per day system-wide — reject rather than silently return
    // another org's entry.
    throw new AppError(
      "Driver is already in a queue for today — one queue per day",
      AppError.CONFLICT,
    );
  }

  // Capture the driver's location at check-in time (fall back to the prior
  // entry's coordinates when the caller didn't send fresh GPS).
  const checkInLat = driverLatitude ?? atOrg?.driverLatitude ?? null;
  const checkInLng = driverLongitude ?? atOrg?.driverLongitude ?? null;

  // Carry over the shipper reservation from the prior entry ONLY when the
  // caller did NOT provide a phone number (this is an implicit re-check-in).
  // An explicit shipperPhoneNumber always re-targets the reservation.
  const preserveTarget =
    data.shipperPhoneNumber === undefined && atOrg
      ? atOrg.targetedShipperUserUUID || null
      : targetedShipperUserUUID || null;

  // RE-CHECK-IN creates BRAND-NEW data: a fresh queueUniqueId and a fresh
  // queueNumber (back of line). Retire the previous same-day entry (soft-delete)
  // so the new row is the only active one and the shipper reservation is freed.
  if (atOrg) {
    await logQueueHistory(executor, {
      queueUniqueId: atOrg.queueUniqueId,
      columnName: "status",
      oldValue: atOrg.status,
      newValue: "removed",
      performedBy: user.userUniqueId,
    });
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "removed",
        shipperRequestUniqueId: null,
        targetedShipperUserUUID: null,
        queueUpdatedAt: currentDate(),
        queueUpdatedBy: user.userUniqueId,
        queueDeletedAt: currentDate(),
        queueDeletedBy: user.userUniqueId,
      },
      conditions: { queueId: atOrg.queueId },
    });
  }

  const queueUniqueId = uuidv4();
  const queueNumber = await nextQueueNumber(
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
        queueNumber,
        vehicleDriverUniqueId,
        targetedShipperUserUUID: preserveTarget,
        driverLatitude: checkInLat,
        driverLongitude: checkInLng,
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
         AND dq.status NOT IN ('removed', 'agreed')
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
         AND dq.status NOT IN ('removed', 'agreed')
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
       AND v.vehicleTypeUniqueId = ? AND dq.status NOT IN ('removed', 'agreed')
       AND dq.queueNumber < ? AND dq.queueDeletedAt IS NULL`,
    [orgId, queueDate, vehicleType, queueNum],
  );

  // Organization details for the queue the driver is currently in (same fields
  // as GET /api/queue/status so both endpoints agree on the org shape).
  const [orgRows] = await executor.query(
    `SELECT queueOrganizationUniqueId, queueOrganizationName, queueOrganizationType,
            queueOrganizationPhone, queueOrganizationAddress, latitude, longitude,
            checkinRadiusKm, approvalStatus, queueEnabled, approvedBy, approvedAt
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
    if (shipper) {
      try {
        const shipperDocuments =
          await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
            shipper.userUniqueId,
            listOfDocumentsTypeAndId.profilePhoto,
          );
        const photoData = shipperDocuments?.data;
        const lastIndex = photoData?.length - 1;
        shipper.profileImage =
          photoData?.[lastIndex]?.attachedDocumentName || null;
      } catch (error) {
        logger.error("Error fetching queue shipper profile photo", {
          error: error.message,
        });
      }
    }
  }

  const [shipperHistory] = await executor.query(
    `SELECT oldValue, performedAt
     FROM DriverQueueHistory
     WHERE queueUniqueId = ? AND columnName = 'targetedShipperUserUUID'
     ORDER BY performedAt DESC LIMIT 10`,
    [rows[0].queueUniqueId],
  );

  return {
    message: "success",
    data: {
      queue: {
        ...publicEntry(rows[0]),
        waitingAhead: ahead[0].total,
      },
      shipper,
      shipperHistory,
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
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status, dq.shipperRequestUniqueId
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
      `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate, dq.status, dq.shipperRequestUniqueId
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
  const isRequested = rows[0].status === "requested";
  const releasedOrder = isRequested ? rows[0].shipperRequestUniqueId : null;

  await logQueueHistory(executor, {
    queueUniqueId: rows[0].queueUniqueId,
    columnName: "status",
    oldValue: rows[0].status,
    newValue: "removed",
    performedBy: user.userUniqueId,
  });
  if (isRequested) {
    await logQueueHistory(executor, {
      queueUniqueId: rows[0].queueUniqueId,
      columnName: "shipperRequestUniqueId",
      oldValue: rows[0].shipperRequestUniqueId,
      newValue: null,
      performedBy: user.userUniqueId,
    });
  }
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "removed",
      shipperRequestUniqueId: null,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
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
        beforeValue: JSON.stringify({ status: rows[0].status }),
        afterValue: JSON.stringify({ status: "removed" }),
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

  return {
    message: "success",
    data: {
      queueUniqueId: rows[0].queueUniqueId,
      status: "removed",
      releasedOrder,
    },
  };
};

// Re-export admin operations for barrel import
module.exports.getQueueStatus = getQueueStatus;
module.exports.manualCheckin = manualCheckin;
module.exports.overrideEntry = overrideEntry;
module.exports.removeEntry = removeEntry;
