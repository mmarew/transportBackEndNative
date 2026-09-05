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
const {
  journeyStatusMap,
  usersRoles,
  listOfDocumentsTypeAndId,
} = require("../Utils/ListOfSeedData");
const {
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../CRUD/Read/ReadData");
const { createUser } = require("./User.service");
const logger = require("../Utils/logger");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { transactionStorage } = require("../Utils/TransactionContext");

const today = () => new Date().toISOString().slice(0, 10); // eslint-disable-line no-magic-numbers -- YYYY-MM-DD;
const QUEUE_OFFER_WINDOW_MINUTES = 3;
const QUEUE_REFUSAL_LIMIT =
  Number(process.env.QUEUE_REFUSAL_LIMIT) || DOMAIN.DEFAULT_QUEUE_REFUSAL_LIMIT;
const MAX_OFFERS_PER_SWEEP = 50;
// Shared resolver: org → vehicle type via VehicleDriver → Vehicle
/**
 * Verify a QueueOrganization exists and is not soft-deleted.
 * Used as a lightweight guard before queue mutations (offer/dispatch/advance).
 * Does NOT re-check approvalStatus/queueEnabled — those are validated at order creation.
 *
 * Also fetches `checkinRadiusKm`, `latitude`, and `longitude` for proximity
 * validation during driver check-in.
 *
 * @param {object} executor - DB executor (connection or transaction)
 * @param {string} queueOrganizationUniqueId
 * @returns {Promise<object>} the org row including checkinRadiusKm, latitude, longitude
 * @throws {AppError} 404 if not found or deleted
 */
const queueOrgReady = async (executor, queueOrganizationUniqueId) => {
  const [org] = await executor.query(
    `SELECT queueOrganizationUniqueId, approvalStatus, queueEnabled,
            checkinRadiusKm, latitude, longitude
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
 * Validate that a driver is within the organization's configurable check-in radius.
 *
 * Uses the Haversine formula (great-circle distance) to calculate the distance
 * between the driver's GPS coordinates and the organization's site reference
 * (latitude/longitude). The maximum allowed distance is set per-org via the
 * `checkinRadiusKm` column on QueueOrganization.
 *
 * Behavior:
 * - If org.checkinRadiusKm is NULL → skip validation (any driver can check in)
 * - If org.latitude/longitude is NULL → skip validation (no reference point)
 * - If driver lat/lng is missing but radius is enforced → reject with 400
 * - If distance exceeds radius → reject with 400
 *
 * @param {object} executor - DB executor (connection or transaction)
 * @param {object} org - The QueueOrganization row (must include checkinRadiusKm, latitude, longitude)
 * @param {number|null} driverLat - Driver's latitude at check-in time
 * @param {number|null} driverLng - Driver's longitude at check-in time
 * @returns {Promise<number|null>} Distance in km, or null if validation is skipped
 * @throws {AppError} 400 if location is required but not provided
 * @throws {AppError} 400 if driver exceeds the max allowed distance
 *
 * @example
 * // Org has no radius → skip validation
 * await validateCheckinDistance(executor, { checkinRadiusKm: null, latitude: 9.03, longitude: 38.74 }, 9.04, 38.75);
 * // → null
 *
 * @example
 * // Org requires 10km radius, driver is within → returns distance
 * await validateCheckinDistance(executor, { checkinRadiusKm: 10, latitude: 9.03, longitude: 38.74 }, 9.04, 38.75);
 * // → 1.5
 *
 * @example
 * // Org requires 5km radius, driver is 15km away → throws 400
 * await validateCheckinDistance(executor, { checkinRadiusKm: 5, latitude: 9.03, longitude: 38.74 }, 9.15, 38.85);
 * // → throws AppError "Too far from queue organization"
 */
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
 * Column-level audit trail for DriverQueue. Logs a single column change.
 * Only stores oldValue — current value is always in DriverQueue itself.
 * No-op if oldValue === newValue (no actual change).
 */
const logQueueHistory = async (
  executor,
  { queueUniqueId, columnName, oldValue, newValue, performedBy },
) => {
  if (oldValue === newValue) return;
  await createData(
    {
      tableName: "DriverQueueHistory",
      insertValues: {
        historyUniqueId: uuidv4(),
        queueUniqueId,
        columnName,
        oldValue:
          oldValue !== null && oldValue !== undefined ? String(oldValue) : null,
        performedBy,
      },
    },
    executor,
  );
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

/**
 * Resolve an active VehicleDriver row by the driver's phone number.
 * Joins Users → VehicleDriver → Vehicle to return the same shape as
 * getVehicleDriverType: { driverUserUniqueId, vehicleUniqueId,
 *   vehicleTypeUniqueId, phoneNumber, fullName }.
 *
 * Throws NOT_FOUND if no active vehicle-driver assignment exists for the phone.
 */
const getVehicleDriverByPhone = async (executor, phoneNumber) => {
  const [rows] = await executor.query(
    `SELECT vd.vehicleDriverUniqueId, vd.driverUserUniqueId, vd.vehicleUniqueId,
            v.vehicleTypeUniqueId, u.phoneNumber, u.fullName
     FROM Users u
     JOIN VehicleDriver vd ON vd.driverUserUniqueId = u.userUniqueId
     JOIN Vehicle v        ON v.vehicleUniqueId      = vd.vehicleUniqueId
     WHERE u.phoneNumber = ? AND vd.assignmentStatus = 'active'
       AND vd.vehicleDriverDeletedAt IS NULL`,
    [phoneNumber],
  );
  if (rows.length === 0) {
    throw new AppError(
      "No active vehicle-driver assignment found for this phone number",
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

/**
 * Shape of a queue entry returned to external callers (drivers, admins, APIs).
 * Strips internal DB fields (IDs, audit columns) and exposes only the
 * information needed by the frontend and other services.
 *
 * @param {object} row - Raw DB row from DriverQueue JOIN VehicleDriver JOIN Vehicle JOIN Users
 * @returns {object} Public queue entry shape
 * @property {string} queueUniqueId - Unique identifier for this queue entry
 * @property {number} queueNumber - Position in the queue (1 = front)
 * @property {string} joinedAt - ISO datetime when the driver checked in
 * @property {string} status - Queue status: 'waiting' | 'requested' | 'agreed' | 'notagreed' | 'removed'
 * @property {string|null} requestedAt - ISO datetime when an order was requested (null if not yet requested)
 * @property {string|null} agreedAt - ISO datetime when the driver agreed to the order
 * @property {string} vehicleDriverUniqueId - FK → VehicleDriver (driver + vehicle pair)
 * @property {string} driverUserUniqueId - FK → Users (the driver's account)
 * @property {string} driverName - Driver's full name
 * @property {string} driverPhoneNumber - Driver's phone number
 * @property {string} vehicleTypeUniqueId - FK → VehicleTypes
 * @property {string|null} shipperRequestUniqueId - FK → ShipperRequest (assigned order, if any)
 * @property {string|null} targetedShipperUserUUID - FK → Users (shipper this position is reserved for)
 * @property {number|null} driverLatitude - Driver's GPS latitude at check-in (for proximity audit)
 * @property {number|null} driverLongitude - Driver's GPS longitude at check-in (for proximity audit)
 */
const publicEntry = (row) => ({
  queueUniqueId: row.queueUniqueId,
  queueNumber: row.queueNumber,
  joinedAt: row.joinedAt,
  status: row.status,
  journeyStatusId: row.journeyStatusId ?? null,
  requestedAt: row.requestedAt,
  agreedAt: row.agreedAt ?? row.loadedAt ?? null,
  vehicleDriverUniqueId: row.vehicleDriverUniqueId,
  driverUserUniqueId: row.driverUserUniqueId,
  driverName: row.fullName,
  driverPhoneNumber: row.phoneNumber,
  vehicleTypeUniqueId: row.vehicleTypeUniqueId,
  shipperRequestUniqueId: row.shipperRequestUniqueId,
  targetedShipperUserUUID: row.targetedShipperUserUUID || null,
  driverLatitude: row.driverLatitude || null,
  driverLongitude: row.driverLongitude || null,
});

// A driver is still "in queue" while waiting, holding a request, or having
// declined the last offer (notagreed) — they remain eligible for the next
// order. Removed (cancelled/checked-out) and agreed (dispatched/completed)
// drivers are free to check back in.
const IN_QUEUE_STATUSES = ["waiting", "requested", "notagreed"];

/**
 * Batch-fetch the latest profile photo per driver for the queue status board.
 * Matches the pattern used by getShipperRequest4allOrSingleUser (attached
 * documents, one photo per user, no N+1).
 *
 * @param {object} executor - DB executor
 * @param {Array<object>} rows - Raw queue status rows (each carries driverUserUniqueId)
 * @returns {Promise<Map<string, string|null>>} driverUserUniqueId → photo name
 */
const buildDriverPhotoMap = async (executor, rows) => {
  const photosByDriver = new Map();
  const driverUserIds = [
    ...new Set(rows.map((r) => r.driverUserUniqueId).filter(Boolean)),
  ];
  if (driverUserIds.length === 0) {
    return photosByDriver;
  }
  const [allPhotos] = await executor.query(
    `SELECT attachedDocumentCreatedByUserId, attachedDocumentName
     FROM AttachedDocuments
     WHERE attachedDocumentCreatedByUserId IN (?)
       AND documentTypeId = ?
     ORDER BY attachedDocumentId DESC`,
    [driverUserIds, listOfDocumentsTypeAndId.profilePhoto],
  );
  for (const photo of allPhotos) {
    if (!photosByDriver.has(photo.attachedDocumentCreatedByUserId)) {
      photosByDriver.set(
        photo.attachedDocumentCreatedByUserId,
        photo.attachedDocumentName,
      );
    }
  }
  return photosByDriver;
};

/**
 * Build a single queue-status board entry mirroring the
 * getShipperRequest4allOrSingleUser shape (shipperRequest / driverRequests /
 * decisions / journey / proofOfDelivery). Each queue slot has exactly one of
 * each, so single objects `{}` are used; if a slot ever holds many, they
 * become arrays `[]`. The driver carries the live journeyStatusId taken from
 * the driver's latest active DriverRequest.
 *
 * @param {object} row - Joined queue status row
 * @param {Map<string, string|null>} photosByDriver - driverUserUniqueId → photo
 * @returns {object} { queue, shipperRequest, driverRequests, decisions, journey, proofOfDelivery }
 */
const buildQueueEntry = (row, photosByDriver) => {
  const queue = {
    queueUniqueId: row.queueUniqueId,
    queueNumber: row.queueNumber,
    joinedAt: row.joinedAt,
    status: row.status,
    requestedAt: row.requestedAt,
    agreedAt: row.agreedAt ?? null,
    vehicleDriverUniqueId: row.vehicleDriverUniqueId,
    shipperRequestUniqueId: row.shipperRequestUniqueId,
    targetedShipperUserUUID: row.targetedShipperUserUUID || null,
    driverLatitude: row.driverLatitude || null,
    driverLongitude: row.driverLongitude || null,
  };

  const shipperRequest = row.shipperRequestId
    ? {
        shipperRequestId: row.shipperRequestId,
        shipperRequestUniqueId: row.orderShipperRequestUniqueId,
        shipperRequestBatchUniqueId: row.shipperRequestBatchUniqueId || null,
        userUniqueId: row.orderUserUniqueId,
        vehicleTypeUniqueId: row.orderVehicleTypeUniqueId || null,
        vehicleTypeName: row.orderVehicleTypeName || null,
        journeyStatusId: row.orderJourneyStatusId ?? null,
        requestMode: row.requestMode || null,
        targetCompanyUniqueId: row.targetCompanyUniqueId || null,
        originLatitude: row.originLatitude || null,
        originLongitude: row.originLongitude || null,
        originPlace: row.originPlace || null,
        destinationLatitude: row.destinationLatitude || null,
        destinationLongitude: row.destinationLongitude || null,
        destinationPlace: row.destinationPlace || null,
        shipperRequestCreatedAt: row.shipperRequestCreatedAt,
        shippableItemName: row.shippableItemName || null,
        shippableItemQtyInQuintal: row.shippableItemQtyInQuintal ?? null,
        shippingDate: row.shippingDate || null,
        deliveryDate: row.deliveryDate || null,
        shippingCost: row.shippingCost ?? null,
        isPodRequired: row.isPodRequired ?? null,
        isCompletionSeen: row.isCompletionSeen ?? null,
        fullName: row.shipperFullName || null,
        email: row.shipperEmail ?? null,
        phoneNumber: row.shipperPhoneNumber || null,
        queueOrganizationUniqueId: row.orderQueueOrganizationUniqueId || null,
      }
    : {};

  const driverRequests = {
    driverRequestId: row.activeDriverRequestId ?? null,
    driverRequestUniqueId: row.activeDriverRequestUniqueId || null,
    userUniqueId: row.driverUserUniqueId,
    journeyStatusId: row.driverJourneyStatusId ?? null,
    fullName: row.fullName || null,
    phoneNumber: row.phoneNumber || null,
    email: row.email ?? null,
    vehicleOfDriver: {
      vehicleUniqueId: row.vehicleUniqueId,
      vehicleTypeUniqueId: row.vehicleTypeUniqueId,
      vehicleTypeName: row.vehicleTypeName,
      licensePlate: row.licensePlate || null,
      vehicleDriverId: row.driverVehicleDriverId ?? null,
    },
    driverProfilePhoto: photosByDriver.get(row.driverUserUniqueId) || null,
  };

  const decisions = row.journeyDecisionUniqueId
    ? {
        journeyDecisionId: row.journeyDecisionId ?? null,
        journeyDecisionUniqueId: row.journeyDecisionUniqueId,
        shipperRequestId: row.decisionShipperRequestId ?? null,
        driverRequestId: row.decisionDriverRequestId ?? null,
        journeyStatusId: row.decisionJourneyStatusId ?? null,
        decisionTime: row.decisionTime,
        decisionBy: row.decisionBy ?? null,
        journeyDecisionCreatedAt: row.journeyDecisionCreatedAt,
        shippingDateByDriver: row.shippingDateByDriver ?? null,
        deliveryDateByDriver: row.deliveryDateByDriver ?? null,
        shippingCostByDriver: row.shippingCostByDriver ?? null,
      }
    : {};

  const journey = row.journeyUniqueId
    ? {
        journeyUniqueId: row.journeyUniqueId,
        journeyStatusId: row.journeyJourneyStatusId ?? null,
        fare: row.journeyFare ?? null,
        journeyStartedAt: row.journeyJourneyStartedAt,
        journeyCompletedAt: row.journeyJourneyCompletedAt,
      }
    : {};

  return {
    queue,
    shipperRequest,
    driverRequests,
    decisions,
    journey,
    proofOfDelivery: null,
  };
};

// Journey statuses that mean the driver is still in flight on an order.
// Accepting a queue offer only marks the queue entry `agreed` (which is NOT in
// IN_QUEUE_STATUSES), so without this fence a dispatched driver could re-check
// in and be offered a SECOND order while their first journey is still active.
const ACTIVE_JOURNEY_STATUSES = [
  // An UNRESOLVED queue offer (status 2 = requested) is treated as an active
  // engagement: the driver holds a live order that has not been accepted,
  // rejected, or timed out. Re-check-in while holding one would retire its
  // queue entry and orphan the offer (the driver's `requested` DriverRequest
  // blocks fresh offers while the order keeps an unbound `requested` state),
  // so the fence below must reject it just like an accepted/in-flight journey.
  journeyStatusMap.requested,
  journeyStatusMap.acceptedByShipper,
  journeyStatusMap.acceptedByDriver,
  journeyStatusMap.goToLoadingPlace,
  journeyStatusMap.loading,
  journeyStatusMap.loaded,
  journeyStatusMap.journeyStarted,
];

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
            checkinRadiusKm, approvalStatus, queueEnabled, approvedBy, approvedAt
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
            dq.requestedAt, dq.agreedAt, dq.vehicleDriverUniqueId,
            dq.shipperRequestUniqueId, dq.targetedShipperUserUUID,
            dq.driverLatitude, dq.driverLongitude,
            areq.driverRequestId AS activeDriverRequestId,
            areq.driverRequestUniqueId AS activeDriverRequestUniqueId,
            areq.journeyStatusId AS driverJourneyStatusId,
            vd.driverUserUniqueId, vd.vehicleDriverId AS driverVehicleDriverId,
            v.vehicleUniqueId, v.vehicleTypeUniqueId,
            v.licensePlate,
            vt.vehicleTypeId, vt.vehicleTypeName,
            u.fullName, u.phoneNumber, u.email,
            su.fullName AS shipperFullName, su.phoneNumber AS shipperPhoneNumber,
            su.email AS shipperEmail, su.userUniqueId AS shipperUserUniqueId,
            sr.shipperRequestId, sr.shipperRequestUniqueId AS orderShipperRequestUniqueId,
            sr.shipperRequestBatchUniqueId, sr.userUniqueId AS orderUserUniqueId,
            sr.vehicleTypeUniqueId AS orderVehicleTypeUniqueId,
            sr.journeyStatusId AS orderJourneyStatusId, sr.requestMode,
            sr.targetCompanyUniqueId, sr.originLatitude, sr.originLongitude,
            sr.originPlace, sr.destinationLatitude, sr.destinationLongitude,
            sr.destinationPlace, sr.shipperRequestCreatedAt,
            sr.shippableItemName, sr.shippableItemQtyInQuintal,
            sr.shippingDate, sr.deliveryDate, sr.shippingCost,
            sr.isPodRequired, sr.isCompletionSeen, sr.shipperRequestCreatedBy,
            srbs.queueOrganizationUniqueId AS orderQueueOrganizationUniqueId,
            ordertt.vehicleTypeName AS orderVehicleTypeName,
            jd.journeyDecisionId, jd.journeyDecisionUniqueId,
            jd.shipperRequestId AS decisionShipperRequestId,
            jd.driverRequestId AS decisionDriverRequestId,
            jd.journeyStatusId AS decisionJourneyStatusId,
            jd.decisionTime, jd.decisionBy, jd.journeyDecisionCreatedAt,
            jd.shippingDateByDriver, jd.deliveryDateByDriver, jd.shippingCostByDriver,
            j.journeyUniqueId, j.journeyStatusId AS journeyJourneyStatusId,
            j.fare AS journeyFare, j.journeyStartedAt AS journeyJourneyStartedAt,
            j.journeyCompletedAt AS journeyJourneyCompletedAt
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
     JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     LEFT JOIN DriverRequest areq ON areq.driverRequestId = (
       SELECT req.driverRequestId
       FROM DriverRequest req
       WHERE req.userUniqueId = vd.driverUserUniqueId
         AND req.driverRequestDeletedAt IS NULL
       ORDER BY req.driverRequestId DESC
       LIMIT 1
     )
     LEFT JOIN JourneyDecisions jd
       ON jd.driverRequestId = areq.driverRequestId
     LEFT JOIN ShipperRequest sr
       ON sr.shipperRequestId = jd.shipperRequestId
      AND sr.shipperRequestDeletedAt IS NULL
     LEFT JOIN ShipperRequestBatch srbs ON srbs.batchUniqueId = sr.shipperRequestBatchUniqueId
     LEFT JOIN Users su ON su.userUniqueId = sr.userUniqueId
     LEFT JOIN VehicleTypes ordertt ON ordertt.vehicleTypeUniqueId = sr.vehicleTypeUniqueId
     LEFT JOIN Journey j ON j.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC`,
    [queueOrganizationUniqueId, queueDate],
  );

  const photosByDriver = await buildDriverPhotoMap(executor, rows);

  const byType = {};
  for (const row of rows) {
    const typeName =
      row.vehicleTypeName || row.vehicleTypeUniqueId || "Unknown";
    if (!byType[typeName]) byType[typeName] = [];
    byType[typeName].push(buildQueueEntry(row, photosByDriver));
  }

  return {
    message: "Query results fetched",
    data: {
      queueOrganization: org,
      queueDate,
      totalWaiting: rows.filter((r) =>
        ["waiting", "notagreed"].includes(r.status),
      ).length,
      queues: byType,
    },
  };
};

/**
 * QueueOrgAdmin manually checks a driver/vehicle into the queue.
 *
 * Mirrors `checkin`'s create-new-data rule: if the driver already has an entry
 * at this org today (active or leftover), it is soft-deleted (`status='removed'`
 * + `queueDeletedAt`) and a brand-new row is inserted with a fresh queueUniqueId
 * and a fresh back-of-line queueNumber. Every manual check-in therefore yields
 * unique queue data; there is no one-entry-per-(vehicle, org, day) constraint.
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
    vehicleDriver = await getVehicleDriverType(executor, vehicleDriverUniqueId);
  } else if (driverPhoneNumber) {
    vehicleDriver = await getVehicleDriverByPhone(executor, driverPhoneNumber);
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
    // FENCE: driver is already active in ANOTHER org today. One queue per
    // driver per day system-wide — reject rather than silently return.
    throw new AppError(
      "Driver is already in a queue for today — one queue per day",
      AppError.CONFLICT,
    );
  }

  // RE-CHECK-IN creates BRAND-NEW data: retire any prior same-day entry at this
  // org (soft-delete) and insert a fresh row with a new queueUniqueId +
  // back-of-line queueNumber. There is no unique key on (vehicle, org, day),
  // so multiple historical rows per driver/org/day are retained; the live one
  // is always the newest with queueDeletedAt IS NULL.
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
          status: "waiting",
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

  await logQueueHistory(executor, {
    queueUniqueId: rows[0].queueUniqueId,
    columnName: "queueNumber",
    oldValue: rows[0].queueNumber,
    newValue: queueNumber,
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
    columnName: "status",
    oldValue: entry.status,
    newValue: "removed",
    performedBy: user.userUniqueId,
  });
  await updateData({
    tableName: "DriverQueue",
    updateValues: {
      status: "removed",
      shipperRequestUniqueId: null,
      queueUpdatedAt: currentDate(),
      queueUpdatedBy: user.userUniqueId,
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
      afterValue: JSON.stringify({ status: "removed" }),
      performedBy: user.userUniqueId,
    },
  });

  // Release a live offer: if the driver currently holds an unresolved
  // (requested) order on this entry, terminalize their active DriverRequest +
  // JourneyDecision and return the order to the queue so it advances to the
  // next eligible driver. Mirrors checkout semantics — a removed/checked-out
  // driver must not keep an active offer or leave an orphaned status-2 journey.
  const releasedOrder = entry.status === "requested" ? entry.shipperRequestUniqueId : null;
  if (releasedOrder) {
    await releaseRequestedOffer({ executor, entry, user });
    const next = await offerToNextDriver({
      executor,
      queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
      queueDate: entry.queueDate,
      vehicleTypeUniqueId: entry.vehicleTypeUniqueId,
      afterQueueNumber: entry.queueNumber,
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
      data: { queueUniqueId, status: "removed", releasedOrder, ...next },
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

  return { message: "success", data: { queueUniqueId, status: "removed", releasedOrder } };
};

/**
 * Terminalize a driver's active (requested) offer for the order currently
 * linked to the given queue entry — moves both the JourneyDecision and the
 * DriverRequest to a terminal cancelled-by-admin state (freeing the driver for
 * future offers) and clears the entry's order link. Used by removeEntry and
 * checkout to avoid leaving orphaned status-2 active journeys.
 */
const releaseRequestedOffer = async ({ executor, entry, user }) => {
  const now = currentDate();

  if (entry.shipperRequestUniqueId) {
    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "shipperRequestUniqueId",
      oldValue: entry.shipperRequestUniqueId,
      newValue: null,
      performedBy: user.userUniqueId,
    });
  }

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
 * Notify a driver of a queue order offer via socket, FCM, and SMS.
 *
 * Called after a pending order is matched to the front-of-queue driver. The
 * notification is sent through three channels:
 * - **Socket**: real-time push to the driver's connected client.
 * - **FCM**: wake the driver's phone even when the app is backgrounded.
 * - **SMS**: fallback if the driver is offline.
 *
 * Best-effort: if any channel fails, the error is logged but not thrown.
 * The driver's `myPosition` poll and socket reconnect will recover the offer
 * independently.
 *
 * @param {Object} params
 * @param {Object} params.front - The front-of-queue driver entry (DriverQueue row).
 * @param {Object} params.shipperRequest - The order being offered.
 * @param {Object} params.vehicle - The driver's vehicle info.
 * @param {Object} params.offerResult - The offer result from the dispatch logic.
 * @returns {Promise<void>}
 */
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

  try {
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
  } catch (socketErr) {
    logger.error("Socket notification failed for queue offer", {
      error: socketErr.message,
      driverUserUniqueId: front.driverUserUniqueId,
      queueUniqueId: front.queueUniqueId,
    });
  }
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
 * Core offer primitive — mark a queue driver as having `requested` an order,
 * link the order, create the JourneyDecision, and notify only that driver over
 * socket.
 *
 * The driver is selected in ONE of three ways:
 *   1. FIFO (default): the FRONT waiting driver of the order's vehicle type
 *      (`afterQueueNumber`/`excludeVehicleDriverUniqueId` steer the scan).
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
 * @param {number} [params.afterQueueNumber] - FIFO: only consider entries with
 *   a queueNumber greater than this (used by reject/advance/timeout).
 * @param {string} [params.excludeVehicleDriverUniqueId] - FIFO: skip this driver.
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
  afterQueueNumber,
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
    const whereParts = [
      `dq.queueOrganizationUniqueId = ?`,
      `dq.queueDate = ?`,
      isTargeted
        ? `(dq.status IN ('waiting', 'notagreed') OR (dq.status = 'requested' AND dq.shipperRequestUniqueId = ?))`
        : `dq.status IN ('waiting', 'notagreed')`,
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
    if (after) {
      whereParts.push(`dq.queueNumber > ?`);
      queryParams.push(after);
    }
    if (targetQueueUniqueId) {
      whereParts.push(`dq.queueUniqueId = ?`);
      queryParams.push(targetQueueUniqueId);
    }
    if (targetVehicleDriverUniqueId) {
      whereParts.push(`dq.vehicleDriverUniqueId = ?`);
      queryParams.push(targetVehicleDriverUniqueId);
    }
    if (excludeVehicleDriverUniqueId) {
      whereParts.push(`dq.vehicleDriverUniqueId <> ?`);
      queryParams.push(excludeVehicleDriverUniqueId);
    }
    whereParts.push(`NOT EXISTS (
           SELECT 1 FROM JourneyDecisions jd
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE jd.shipperRequestId = ?
             AND dr.userUniqueId = vd.driverUserUniqueId
             AND jd.journeyStatusId IN (?, ?, ?, ?)
         )`);
    queryParams.push(...skipRejectedParams);

    const [front] = await txExecutor.query(
      `SELECT dq.*, vd.driverUserUniqueId, u.phoneNumber, u.fullName
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       WHERE ${whereParts.join(" AND ")}
       ORDER BY dq.queueNumber ASC LIMIT 1
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
    // because the WHERE clause only admits 'requested' rows in targeted mode.
    if (isTargeted && entry.status === "requested") {
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
            status: "requested",
          },
        };
      }
    }

    // EXCLUSIVE RESERVATION: if this driver targeted a specific shipper via
    // phone at check-in, only offer them orders from that shipper. Skip to
    // the next driver in FIFO otherwise.
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
      after = entry.queueNumber;
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
      after = entry.queueNumber;
      continue;
    }

    const offerResult = await createQueueOffer(txExecutor, {
      shipperRequest,
      driverRequest,
      user,
    });

    await logQueueHistory(txExecutor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "status",
      oldValue: entry.status,
      newValue: "requested",
      performedBy: user.userUniqueId,
    });
    await logQueueHistory(txExecutor, {
      queueUniqueId: entry.queueUniqueId,
      columnName: "shipperRequestUniqueId",
      oldValue: entry.shipperRequestUniqueId,
      newValue: shipperRequestUniqueId,
      performedBy: user.userUniqueId,
    });

    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: "requested",
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
        status: "requested",
      },
    };
  }
};

/**
 * Dispatch — manually offer a waiting order to a queue driver (QueueOrgAdmin).
 *
 * Exactly one driver-selection mode must be used:
 *   1. `vehicleTypeUniqueId` → offer to the FRONT waiting driver of that type
 *      (FIFO). `queueUniqueId`/`driverPhoneNumber` must be absent.
 *   2. `queueUniqueId` → offer to a specific queue entry (its driver). The
 *      entry must be `waiting`/`notagreed` in this org for today, of the
 *      order's vehicle type, not have already refused the order, and not be
 *      pinned to a different shipper. If the entry is ALREADY `requested` for
 *      this exact order (e.g. order-create auto-dispatch offered it FIFO), the
 *      dispatch is an idempotent no-op success and returns the existing offer.
 *   3. `driverPhoneNumber` → offer to a specific driver by phone (resolved to
 *      their active vehicle assignment, then their queue entry under the same
 *      rules as mode 2).
 *
 * `driverPhoneNumber` and `queueUniqueId` are mutually exclusive. When either
 * is used, `vehicleTypeUniqueId` may be omitted (it defaults to the order's).
 *
 * @param {Object} data
 * @param {string} data.queueOrganizationUniqueId - UUID of the queue org (required).
 * @param {string} [data.vehicleTypeUniqueId] - FIFO dispatch to front driver of this type.
 * @param {string} [data.queueUniqueId] - Targeted dispatch to this queue entry.
 * @param {string} [data.driverPhoneNumber] - Targeted dispatch to this driver's phone.
 * @param {string} [data.shipperRequestUniqueId] - The order to dispatch (required;
 *   the service resolves it internally).
 * @param {Object} data.user - The acting admin (recorded as performer).
 * @returns {Promise<{message: string, offered: boolean, data: Object|null}>}
 *   On success `{ message: "success", offered: true, data: { queueUniqueId,
 *   queueNumber, driverUserUniqueId, journeyDecisionUniqueId, status: "requested" } }`.
 * @throws {AppError} 400 - no selection mode given, or both queueUniqueId and
 *   driverPhoneNumber given.
 * @throws {AppError} 404 - queue org not ready, driver phone unknown/inactive,
 *   order unknown, or targeted entry/driver not dispatchable.
 * @throws {AppError} 400 - targeted driver reserved for another shipper or has
 *   no active DriverRequest record.
 */
exports.dispatch = async (data) => {
  const {
    queueOrganizationUniqueId,
    vehicleTypeUniqueId,
    queueUniqueId,
    driverPhoneNumber,
    shipperRequestUniqueId,
    user,
  } = data;
  if (!queueUniqueId && !driverPhoneNumber && !vehicleTypeUniqueId) {
    throw new AppError(
      "Provide vehicleTypeUniqueId (front driver), queueUniqueId, or driverPhoneNumber",
      AppError.BAD_REQUEST,
    );
  }
  if (queueUniqueId && driverPhoneNumber) {
    throw new AppError(
      "Provide either queueUniqueId or driverPhoneNumber, not both",
      AppError.BAD_REQUEST,
    );
  }

  // Resolve a phone number to the driver's active vehicle assignment.
  let targetVehicleDriverUniqueId = null;
  if (driverPhoneNumber) {
    const [driverRows] = await db().query(
      `SELECT vd.vehicleDriverUniqueId
       FROM Users u
       JOIN VehicleDriver vd ON vd.driverUserUniqueId = u.userUniqueId
       WHERE u.phoneNumber = ?
         AND vd.assignmentStatus = 'active'
         AND vd.vehicleDriverDeletedAt IS NULL
       LIMIT 1`,
      [driverPhoneNumber],
    );
    if (driverRows.length === 0) {
      throw new AppError(
        "No active driver found for that phone number",
        AppError.NOT_FOUND,
      );
    }
    targetVehicleDriverUniqueId = driverRows[0].vehicleDriverUniqueId;
  }

  const result = await executeInTransaction(
    () =>
      offerToDriver({
        executor: db(),
        queueOrganizationUniqueId,
        queueDate: today(),
        vehicleTypeUniqueId,
        targetQueueUniqueId: queueUniqueId || null,
        targetVehicleDriverUniqueId,
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
 * `offerToDriver` marks the front driver `offered`, so the next iteration
 * advances to the next driver — a single check-in can therefore fill several
 * free slots when the org has a backlog.
 *
 * Runs inside the check-in's transaction: reuses the outer connection via
 * `transactionStorage` so the just-created queue entry is visible to
 * `offerToDriver` and the `FOR UPDATE` lock serializes concurrent check-ins.
 * Calls `offerToDriver` directly (not through `handleQueueDispatch`) to avoid
 * nesting a second `executeInTransaction` which would open a separate
 * connection blind to the outer tx's uncommitted rows.
 * Best-effort — returns `{ offered: false, data: null }` when nothing pending.
 */
const rescanPendingQueueOrder = async ({
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
  user,
}) => {
  // When called inside an outer transaction (e.g. checkin), use that
  // transaction's connection so offerToDriver can see the just-created queue
  // entry.  handleQueueDispatch wraps in its OWN executeInTransaction, which
  // opens a new connection blind to the outer tx's uncommitted rows — the
  // front-driver SELECT would miss them and return no match.
  const executor = transactionStorage.getStore() || db();
  const [rows] = await executor.query(
    `SELECT sr.shipperRequestUniqueId
     FROM ShipperRequest sr
     -- queueOrganizationUniqueId is canonical on the batch (srb), inherited via join
     JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
     WHERE srb.queueOrganizationUniqueId = ?
       AND sr.vehicleTypeUniqueId = ?
       AND sr.requestMode <> 'company_target'
       -- Bidding-board orders (isBiddingApproved=TRUE, PER-ORDER) are distance-matched,
       -- never FIFO-dispatched, so skip them here. Orders NOT opened to bidding (FALSE,
       -- or NULL for rows created before the column was back-filled) remain FIFO-offered.
       -- "IS NOT TRUE" is TRUE for both FALSE and NULL, so legacy NULL rows still dispatch.
       AND (sr.isBiddingApproved = FALSE OR sr.isBiddingApproved IS NULL)
       AND sr.journeyStatusId IN (?, ?)
       AND sr.shipperRequestDeletedAt IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM DriverQueue dq
         WHERE dq.shipperRequestUniqueId = sr.shipperRequestUniqueId
           AND dq.status = 'requested'
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
    const result = await offerToDriver({
      executor,
      queueOrganizationUniqueId,
      queueDate: today(),
      vehicleTypeUniqueId,
      shipperRequestUniqueId: row.shipperRequestUniqueId,
      afterQueueNumber: null,
      user,
      throwIfNone: false,
    });
    if (result?.offered) {
      return result;
    }
  }
  return { offered: false, data: null };
};

// Safety cap per sweep so a pathological backlog can never loop forever.

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
     WHERE dq.queueDate = ? AND dq.status IN ('waiting', 'notagreed') AND dq.queueDeletedAt IS NULL
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
