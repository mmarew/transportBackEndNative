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
const { getVehicleDrivers } = require("./VehicleDriver.service");

const today = () => new Date().toISOString().slice(0, 10); // eslint-disable-line no-magic-numbers -- YYYY-MM-DD;
const QUEUE_OFFER_WINDOW_MINUTES = 3;
const QUEUE_REFUSAL_LIMIT =
  Number(process.env.QUEUE_REFUSAL_LIMIT) || DOMAIN.DEFAULT_QUEUE_REFUSAL_LIMIT;
const MAX_OFFERS_PER_SWEEP = 50;
// DriverQueue.status is a journeyStatusMap id (column is INT) so ONE status
// vocabulary is used across the whole project. Terminal/closed entries (job
// done, driver left, admin removed, order cancelled, driver ignored the offer)
// are soft-deleted rows flagged by queueDeletedAt and keep a terminal id here.
const QUEUE_STATUS = {
  WAITING: journeyStatusMap.waiting, // 1
  REQUESTED: journeyStatusMap.requested, // 2
  AGREED: journeyStatusMap.acceptedByDriver, // 3
  GO_TO_LOADING_PLACE: journeyStatusMap.goToLoadingPlace, // 5
  LOADING: journeyStatusMap.loading, // 6
  LOADED: journeyStatusMap.loaded, // 7
  JOURNEY_STARTED: journeyStatusMap.journeyStarted, // 8
  JOURNEY_COMPLETED: journeyStatusMap.journeyCompleted, // 9
  SHIPPER_CANCELED: journeyStatusMap.cancelledByShipper, // 10
  CANCELLED_AFTER_ACCEPT: journeyStatusMap.cancelledByDriver, // 12 (also checkout)
  QUEUE_ADMIN_CANCELED: journeyStatusMap.cancelledByAdmin, // 13
  NO_ANSWER_FROM_DRIVER: journeyStatusMap.noAnswerFromDriver, // 16 (no-answer timeout; order retained while no next driver takes it)
  CANCELLED_BEFORE_ACCEPT: journeyStatusMap.rejectedByDriver, // 18 (kept position, still line)
};
// BATCH-REFUSAL RULE statuses — a driver who reached any of these terminal
// "said no" journey statuses against an order of a batch cools the WHOLE batch
// for automatic re-offers. Applied by `offerToDriver` on FIFO scans ONLY
// (targeted dispatch is exempt). Carries over the legacy rejection set used by
// `findNearbyDrivers` (VerifyIfShipperRequestWasNotRejected) so every matcher
// agrees on which statuses cool a batch.
const {
  REJECTED_STATUS_IDS: BATCH_DECLINED_JOURNEY_STATUSES,
} = require("../Utils/RejectedRequests");
// DriverQueueHistory.historyEvent vocabulary — names the mutation whose
// pre-image snapshots are stored in the audit trail (snapshot mirror of
// DriverQueue, equal column number).
const HISTORY_EVENT = {
  CHECKIN: "checkin",
  MANUAL_CHECKIN: "manual_checkin",
  CHECKOUT: "checkout",
  REMOVE: "remove",
  LANE_OVERRIDE: "lane_override",
  OFFER: "offer",
  OFFER_REJECTED: "offer_rejected",
  OFFER_TIMEOUT: "offer_timeout",
  ACCEPT: "accept",
  ORDER_CANCELLED: "order_cancelled",
  DRIVER_CANCEL_AFTER_ACCEPT: "driver_cancel_after_accept",
  JOURNEY_PROGRESS: "journey_progress",
  JOURNEY_COMPLETED: "journey_completed",
  REFUSAL: "refusal",
  ADVANCE_RELEASE: "advance_release",
  NOT_SELECTED: "not_selected",
  SHIPPER_RESERVED: "shipper_reserved",
};
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
  // FOR UPDATE holds an org-row lock for the rest of the transaction. This
  // SERIALIZES concurrent check-ins for the same org so exactly one wins; the
  // loser observes the committed entry via getDriverQueueState and returns it
  // idempotently instead of double-inserting (no unique key on driver/org/day).
  const [org] = await executor.query(
    `SELECT queueOrganizationUniqueId, approvalStatus, queueEnabled,
            checkinRadiusKm, latitude, longitude
     FROM QueueOrganization
     WHERE queueOrganizationUniqueId = ? AND isDeleted = 0 FOR UPDATE`,
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
 * `checkinRadiusKm` column on QueueOrganization (NOT NULL, default 15).
 *
 * Behavior:
 * - If org.checkinRadiusKm is falsy (0) → skip validation (any driver can check in)
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
 * // Org has no radius (0) → skip validation
 * await validateCheckinDistance(executor, { checkinRadiusKm: 0, latitude: 9.03, longitude: 38.74 }, 9.04, 38.75);
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
 * Snapshot audit trail for DriverQueue. Called BEFORE a mutation (or right
 * AFTER a row INSERT), it reads the entry's CURRENT full row and stores it as
 * an immutable snapshot in DriverQueueHistory — a literal mirror of every
 * DriverQueue column (equal column number) — tagged with the `event` that is
 * about to happen. `oldValue` of the transition = the snapshot fields; the
 * `newValue` = the next snapshot (or the live row for the newest event).
 * No-ops silently if the entry no longer exists.
 */
const logQueueHistory = async (
  executor,
  { queueUniqueId, event, performedBy },
) => {
  if (!queueUniqueId) return;
  const [snapshot] = await executor.query(
    `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate, queueNumber,
            queueRefusalCount, vehicleDriverUniqueId, shipperRequestUniqueId,
            targetedShipperUserUUID, driverLatitude, driverLongitude, joinedAt, status,
            requestedAt, agreedAt, queueCreatedAt, queueCreatedBy, queueUpdatedAt,
            queueUpdatedBy, queueDeletedAt, queueDeletedBy
     FROM DriverQueue WHERE queueUniqueId = ?`,
    [queueUniqueId],
  );
  if (snapshot.length === 0) return;
  await createData(
    {
      tableName: "DriverQueueHistory",
      insertValues: {
        historyUniqueId: uuidv4(),
        historyEvent: event,
        ...snapshot[0],
        performedBy,
      },
    },
    executor,
  );
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
 * @property {string} status - journeyStatusMap id: 1 waiting | 2 requested | 3 agreed (acceptedByDriver) | 5/6/7 loading stages | 8 journeyStarted | 9 journeyCompleted | 10/12/13/16/18 closed/cancelled ids
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

// A driver is still "in queue" while waiting, holding a request, having
// declined the last offer (notagreed), or having timed out on the offer
// (no-answer) — they remain eligible for the next order. Removed
// (cancelled/checked-out) and agreed (dispatched/completed) drivers are free
// to check back in.
const IN_QUEUE_STATUSES = [
  QUEUE_STATUS.WAITING, // 1
  QUEUE_STATUS.REQUESTED, // 2
  QUEUE_STATUS.NO_ANSWER_FROM_DRIVER, // 16
  QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT, // 18
];

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
const buildQueueEntry = (row, photosByDriver, podByDC = new Map()) => {
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

  const proofOfDelivery = row.podUniqueId
    ? {
        deliveryConfirmationUniqueId: row.podUniqueId,
        receiverFullName: row.podReceiverFullName ?? null,
        receiverPhoneNumber: row.podReceiverPhoneNumber ?? null,
        deliveredQuantity: row.podDeliveredQuantity ?? null,
        quantityUnit: row.podQuantityUnit ?? null,
        condition: row.podCondition ?? null,
        deliveryConfirmationStatus: row.podStatus ?? null,
        deliveryConfirmationSource: row.podSource ?? null,
        shipperSignature: row.podShipperSignature ?? null,
        notes: row.podNotes ?? null,
        podSubmittedAt: row.podSubmittedAt ?? null,
        photos: podByDC.get(row.podUniqueId) || [],
      }
    : null;

  return {
    queue,
    shipperRequest,
    driverRequests,
    decisions,
    journey,
    proofOfDelivery,
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
 * - `active`: first entry still in the queue (blocks re-check-in while a live
 *   entry exists anywhere, and rejects being active in another org), or null.
 *   Any non-deleted row with an in-queue status counts.
 */
const getDriverQueueState = async (executor, driverUserUniqueId, queueDate) => {
  const [rows] = await executor.query(
    `SELECT dq.queueId, dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueNumber, dq.status,
            dq.targetedShipperUserUUID, dq.driverLatitude, dq.driverLongitude,
            o.queueOrganizationName
     FROM DriverQueue dq
     JOIN QueueOrganization o ON o.queueOrganizationUniqueId = dq.queueOrganizationUniqueId
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueId DESC
     FOR UPDATE`,
    [queueDate, driverUserUniqueId],
  );
  const active = rows.find((r) => IN_QUEUE_STATUSES.includes(r.status)) || null;
  return { active };
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
 *    the fence never orphans a live offer.
 * 5. Fence: one ACTIVE queue per driver per day system-wide (other-org → 409)
 * 6. Re-check-in with a LIVE entry at this org is IDEMPOTENT — the existing
 *    entry is returned and no new row is inserted. Re-check-in creates a NEW
 *    row (fresh queueUniqueId + fresh back-of-line queueNumber) only once the
 *    day is clean (prior entry terminal — completed/checked out). Previous
 *    rows are NEVER mutated by check-in; a driver may check in many times over
 *    a day, one new row per finished job.
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
// Resolve the driver's ACTIVE vehicle assignment via the canonical VehicleDriver
// CRUD (getVehicleDrivers). Rejects soft-deleted or absent assignments so
// check-in only ever proceeds with a real, active vehicle-driver binding.
const resolveActiveVehicleDriver = async ({
  vehicleDriverUniqueId,
  phoneNumber,
}) => {
  const { data = [] } = await getVehicleDrivers({
    vehicleDriverUniqueId,
    phoneNumber,
    assignmentStatus: "active",
    limit: 1,
  });
  const vehicleDriver = data[0];
  if (!vehicleDriver || vehicleDriver.vehicleDriverDeletedAt) {
    throw new AppError(
      "Active vehicle-driver assignment not found",
      AppError.NOT_FOUND,
    );
  }
  return vehicleDriver;
};

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

  const vehicleDriver = await resolveActiveVehicleDriver({
    vehicleDriverUniqueId,
  });
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
  // active entry in a different org is rejected. Re-check-in while a LIVE entry
  // exists at the same org is idempotent — the existing entry is returned and
  // no new row is inserted. Re-check-in creates a NEW row only once the day is
  // clean (prior entry terminal — completed/checked out); previous rows are
  // NEVER mutated by check-in.
  const { active } = await getDriverQueueState(
    executor,
    vehicleDriver.driverUserUniqueId,
    queueDate,
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
    // Same-org live entry — idempotent re-check-in: return it unchanged.
    // "Create new row" applies only after the prior entry is terminal, so a
    // driver may check in many times over a day (one row per finished job).
    if (targetedShipperUserUUID) {
      // A phone was provided on this re-check-in → (re)reserve the live
      // position for that shipper. The reservation is a property of the
      // position; re-affirming/updating it must not retire the row.
      await executor.query(
        `UPDATE DriverQueue
         SET targetedShipperUserUUID = ?,
             queueUpdatedAt = ?,
             queueUpdatedBy = ?
         WHERE queueUniqueId = ?`,
        [
          targetedShipperUserUUID,
          currentDate(),
          user.userUniqueId,
          active.queueUniqueId,
        ],
      );
      await logQueueHistory(executor, {
        queueUniqueId: active.queueUniqueId,
        event: HISTORY_EVENT.SHIPPER_RESERVED,
        performedBy: user.userUniqueId,
      });
    }
    return {
      message: "success",
      data: {
        alreadyCheckedIn: true,
        queueUniqueId: active.queueUniqueId,
        queueNumber: active.queueNumber,
        status: active.status,
        targetedShipperUserUUID:
          targetedShipperUserUUID || active.targetedShipperUserUUID || null,
        queueOrganizationUniqueId: active.queueOrganizationUniqueId,
        queueOrganizationName: active.queueOrganizationName,
      },
    };
  }

  // Capture the driver's location at check-in time.
  const checkInLat = driverLatitude ?? null;
  const checkInLng = driverLongitude ?? null;

  // The day is clean — the shipper reservation applies from the caller's phone
  // directly (no prior same-day entry to carry a reservation over from).
  const preserveTarget = targetedShipperUserUUID || null;

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
  // at check-in. One snapshot holds the entire created row.
  await logQueueHistory(executor, {
    queueUniqueId,
    event: HISTORY_EVENT.CHECKIN,
    performedBy: user.userUniqueId,
  });

  // Check-in auto-offer: pair the oldest pending queue order of this driver's
  // vehicle type with the FRONT waiting driver (FIFO, one order per check-in).
  // Runs inside the check-in transaction — the FOR UPDATE lock serializes
  // concurrent check-ins, so one order is never double-offered.
  await rescanPendingQueueOrder({
    queueOrganizationUniqueId,
    vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
    user,
  });

  // Check-in auto-offer for BID-BASE orders (driver-anchored PULL). The FIFO
  // rescan above only serves non-bidding orders. The just-joined driver is
  // matched against THIS org's open bidding board from their CURRENT check-in
  // position (findNearbyShippers — no pre-armed DriverRequest needed), so a
  // driver who checks in AFTER the request was created is always found and the
  // offer is anchored at their live position, never a finished job.
  // A landed bid offer JOINS THE QUEUE: the driver's fresh entry is linked to
  // the order exactly like a FIFO offer (status REQUESTED + order linkage), so
  // the offer is rejectable/advanceable and markEntryAgreed resolves by order.
  const {
    pullPendingBidOrderForDriver,
  } = require("./ShipperRequest/statusVerification.service");
  const bidOffer = await pullPendingBidOrderForDriver({
    driverUserUniqueId: vehicleDriver.driverUserUniqueId,
    driverLatitude: checkInLat,
    driverLongitude: checkInLng,
    queueOrganizationUniqueId,
    vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
    user,
  });
  if (bidOffer?.offered && bidOffer?.data?.shipperRequestUniqueId) {
    const [entryRows] = await executor.query(
      `SELECT dq.queueId, dq.queueUniqueId
       FROM DriverQueue dq
       WHERE dq.queueUniqueId = ?
         AND dq.status = ${QUEUE_STATUS.WAITING}
         AND dq.queueDeletedAt IS NULL
       LIMIT 1`,
      [queueUniqueId],
    );
    if (entryRows.length > 0) {
      const joinedEntry = entryRows[0];
      await logQueueHistory(executor, {
        queueUniqueId: joinedEntry.queueUniqueId,
        event: HISTORY_EVENT.OFFER,
        performedBy: user.userUniqueId,
      });
      await updateData({
        tableName: "DriverQueue",
        conditions: { queueId: joinedEntry.queueId },
        updateValues: {
          status: QUEUE_STATUS.REQUESTED,
          shipperRequestUniqueId: bidOffer.data.shipperRequestUniqueId,
          requestedAt: currentDate(),
          queueUpdatedAt: currentDate(),
          queueUpdatedBy: user.userUniqueId,
        },
      });
    }
  }

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
         AND dq.status IN (${IN_QUEUE_STATUSES.join(", ")})
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
         AND dq.status IN (${IN_QUEUE_STATUSES.join(", ")})
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
       AND v.vehicleTypeUniqueId = ? AND dq.status IN (${IN_QUEUE_STATUSES.join(", ")})
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
    `SELECT h.targetedShipperUserUUID, h.performedAt
     FROM DriverQueueHistory h
     JOIN DriverQueue dq ON dq.queueUniqueId = h.queueUniqueId
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     WHERE vd.driverUserUniqueId = ? AND dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND h.targetedShipperUserUUID IS NOT NULL
     ORDER BY h.performedAt DESC LIMIT 10`,
    [rows[0].driverUserUniqueId, orgId, queueDate],
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
 * Terminalize a driver's pending offer for a queue order (their Decision +
 * active DriverRequest) so no live offer outlives the driver leaving the line
 * or the order moving on. Mirrors the timeout sweep's terminalizing step: the
 * request goes to a TERMINAL status (rejectedByDriver), never back to
 * `waiting`, because a `waiting` request that still carries a decision can
 * never be reused (JourneyDecisions.driverRequestId is UNIQUE) and keeps
 * `activeRequestGuard = 1`, killing the next offer on the unique index.
 * Idempotent — no-op when there is nothing live for the (driver, order) pair.
 */
const terminalizeQueueOrderRequest = async ({
  executor,
  driverUserUniqueId,
  shipperRequestUniqueId,
  actor,
}) => {
  const [rows] = await executor.query(
    `SELECT dr.driverRequestId, jd.journeyDecisionUniqueId
     FROM ShipperRequest sr
     JOIN JourneyDecisions jd ON jd.shipperRequestId = sr.shipperRequestId
     JOIN DriverRequest dr    ON dr.driverRequestId = jd.driverRequestId
     WHERE sr.shipperRequestUniqueId = ? AND dr.userUniqueId = ?
       AND dr.journeyStatusId = ?
     ORDER BY dr.driverRequestId DESC LIMIT 1
     FOR UPDATE`,
    [shipperRequestUniqueId, driverUserUniqueId, journeyStatusMap.requested],
  );
  if (rows.length === 0) return null;
  const now = currentDate();
  await updateData({
    tableName: "JourneyDecisions",
    updateValues: {
      journeyStatusId: journeyStatusMap.rejectedByDriver,
      journeyDecisionUpdatedAt: now,
      journeyDecisionUpdatedBy: actor.userUniqueId,
      isCancellationByDriverSeenByShipper: "no need to see it",
    },
    conditions: { journeyDecisionUniqueId: rows[0].journeyDecisionUniqueId },
  });
  await updateData({
    tableName: "DriverRequest",
    updateValues: {
      journeyStatusId: journeyStatusMap.rejectedByDriver,
      driverRequestUpdatedAt: now,
      driverRequestUpdatedBy: actor.userUniqueId,
    },
    conditions: { driverRequestId: rows[0].driverRequestId },
  });
  return rows[0];
};

/**
 * Driver leaves the queue (checkout / no-show) — entry marked terminal.
 * If queueOrganizationUniqueId provided, scope to that org; otherwise find via fence.
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
         AND vd.driverUserUniqueId = ? AND dq.status IN (${IN_QUEUE_STATUSES.join(", ")})
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
       WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ? AND dq.status IN (${IN_QUEUE_STATUSES.join(", ")})
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
            j.journeyCompletedAt AS journeyJourneyCompletedAt,
            dc.deliveryConfirmationUniqueId AS podUniqueId,
            u_recv.fullName AS podReceiverFullName,
            u_recv.phoneNumber AS podReceiverPhoneNumber,
            dc.deliveryConfirmationDeliveredQuantity AS podDeliveredQuantity,
            dc.deliveryConfirmationQuantityUnit AS podQuantityUnit,
            dc.deliveryConfirmationCondition AS podCondition,
            dc.deliveryConfirmationStatus AS podStatus,
            dc.deliveryConfirmationSource AS podSource,
            dc.deliveryConfirmationShipperSignature AS podShipperSignature,
            dc.deliveryConfirmationNotes AS podNotes,
            dc.deliveryConfirmationConfirmedAt AS podSubmittedAt
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt    ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
JOIN Users u            ON u.userUniqueId           = vd.driverUserUniqueId
     -- The nested shipperRequest / driverRequests / decisions / journey blocks
     -- describe the order ATTACHED TO THIS ENTRY (dq.shipperRequestUniqueId),
     -- never the driver's latest history. A free (WAITING) entry therefore shows
     -- an empty block instead of a stale recycled offer from a previous job.
     LEFT JOIN ShipperRequest sr
       ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
       AND sr.shipperRequestDeletedAt IS NULL
     LEFT JOIN JourneyDecisions jd
       ON jd.shipperRequestId = sr.shipperRequestId
       AND jd.journeyDecisionId = (
         SELECT MAX(j2.journeyDecisionId)
         FROM JourneyDecisions j2
         JOIN DriverRequest req ON req.driverRequestId = j2.driverRequestId
         WHERE j2.shipperRequestId = sr.shipperRequestId
           AND req.userUniqueId = vd.driverUserUniqueId
           AND req.driverRequestDeletedAt IS NULL
       )
     LEFT JOIN DriverRequest areq ON areq.driverRequestId = jd.driverRequestId
     LEFT JOIN ShipperRequestBatch srbs ON srbs.batchUniqueId = sr.shipperRequestBatchUniqueId
     LEFT JOIN Users su ON su.userUniqueId = sr.userUniqueId
     LEFT JOIN VehicleTypes ordertt ON ordertt.vehicleTypeUniqueId = sr.vehicleTypeUniqueId
     LEFT JOIN Journey j ON j.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
     LEFT JOIN DeliveryConfirmations dc
       ON dc.journeyUniqueId = j.journeyUniqueId
       AND dc.deliveryConfirmationDeletedAt IS NULL
     LEFT JOIN Users u_recv ON u_recv.userUniqueId = dc.receiverUserUniqueId
     WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
       AND dq.queueDeletedAt IS NULL
     ORDER BY dq.queueNumber ASC`,
    [queueOrganizationUniqueId, queueDate],
  );

  const photosByDriver = await buildDriverPhotoMap(executor, rows);

  // POD photos for the linked delivery confirmation rows (same grouping used by
  // the shipper-request read flow): all non-deleted photos per confirmation,
  // ordered by photo id so the admin entry-detail can render them in order.
  const podByDC = new Map();
  const podIds = [
    ...new Set(rows.map((r) => r.podUniqueId).filter(Boolean)),
  ];
  if (podIds.length > 0) {
    const [podPhotos] = await executor.query(
      `SELECT deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl
       FROM DeliveryConfirmationPhotos
       WHERE deliveryConfirmationUniqueId IN (?)
         AND deliveryConfirmationPhotoDeletedAt IS NULL
       ORDER BY deliveryConfirmationPhotoId ASC`,
      [podIds],
    );
    for (const p of podPhotos) {
      if (!podByDC.has(p.deliveryConfirmationUniqueId)) {
        podByDC.set(p.deliveryConfirmationUniqueId, []);
      }
      podByDC.get(p.deliveryConfirmationUniqueId).push(p.deliveryConfirmationPhotoUrl);
    }
  }

  // Removed counter: entries that have LEFT the line today (checked out /
  // admin-removed / cancelled after accept / completed). The live `rows` query
  // filters queueDeletedAt IS NULL, so these are counted in a dedicated query.
  const [removedRows] = await executor.query(
    `SELECT COUNT(*) AS total FROM DriverQueue
     WHERE queueOrganizationUniqueId = ?
       AND queueDate = ?
       AND queueDeletedAt IS NOT NULL`,
    [queueOrganizationUniqueId, queueDate],
  );

  const isWaiting = (s) =>
    [QUEUE_STATUS.WAITING, QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT].includes(s);
  const isAgreed = (s) =>
    [
      QUEUE_STATUS.AGREED,
      QUEUE_STATUS.GO_TO_LOADING_PLACE,
      QUEUE_STATUS.LOADING,
      QUEUE_STATUS.LOADED,
      QUEUE_STATUS.JOURNEY_STARTED,
      QUEUE_STATUS.JOURNEY_COMPLETED,
    ].includes(s);

  const byType = {};
  for (const row of rows) {
    const typeName =
      row.vehicleTypeName || row.vehicleTypeUniqueId || "Unknown";
    if (!byType[typeName]) byType[typeName] = [];
    byType[typeName].push(buildQueueEntry(row, photosByDriver, podByDC));
  }

  return {
    message: "Query results fetched",
    data: {
      queueOrganization: org,
      queueDate,
      totalWaiting: rows.filter((r) => isWaiting(r.status)).length,
      statistics: {
        waiting: rows.filter((r) => isWaiting(r.status)).length,
        requested: rows.filter(
          (r) => r.status === QUEUE_STATUS.REQUESTED,
        ).length,
        agreed: rows.filter((r) => isAgreed(r.status)).length,
        notAgreed: rows.filter(
          (r) =>
            r.status === QUEUE_STATUS.NO_ANSWER_FROM_DRIVER ||
            r.status === QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT,
        ).length,
        removed: Number(removedRows?.[0]?.total || 0),
      },
      queues: byType,
    },
  };
};

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
 * Terminalize a driver's active (requested) offer for the order currently
 * linked to the given queue entry — moves both the JourneyDecision and the
 * DriverRequest to a terminal cancelled-by-admin state (freeing the driver for
 * future offers) and clears the entry's order link. Used by removeEntry and
 * checkout to avoid leaving orphaned status-2 active journeys.
 */
const releaseRequestedOffer = async ({ executor, entry, user }) => {
  const now = currentDate();

  // Audit is captured by the caller (removeEntry) as a single `remove` snapshot
  // BEFORE this helper runs — the pre-image covers the shipperRequest clear too.

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
 * ### Reservation priority (shipper's right)
 *
 * A driver can reserve their queue position for ONE shipper at check-in
 * (`shipperPhoneNumber` → `targetedShipperUserUUID`). That reservation is
 * exclusive — it is never a hint — and this function enforces both halves:
 *
 * - **WHY (#1 — protect):** a driver reserved for shipper X must never be
 *   offered to shipper Y's order. Without this, another shipper's orders could
 *   queue-jump ahead of the reserving shipper by consuming their targeted
 *   drivers ("stealing" the reservation).
 * - **WHY (#2 — redirect):** shipper X's OWN orders must reach their reserved
 *   drivers FIRST, even when general (unreserved) drivers sit ahead of them by
 *   queue position. The reservation is the shipper's right to their fleet.
 *
 * - **HOW (#1):** the FIFO scan adds
 *   `(dq.targetedShipperUserUUID IS NULL OR dq.targetedShipperUserUUID = ?)`,
 *   so drivers reserved for a DIFFERENT shipper never enter the candidate set —
 *   they are excluded by the WHERE clause, not skipped per-row. Targeted mode
 *   dispatch (2/3) additionally throws `400 "Driver is reserved for a different
 *   shipper"` so an admin can never reassign a reserved driver by hand either.
 * - **HOW (#2):** the FIFO scan orders candidates
 *   `CASE WHEN dq.targetedShipperUserUUID = ? THEN 0 ELSE 1 END, dq.queueNumber ASC`
 *   — the reserving shipper's drivers are offered before all general drivers,
 *   each group by queueNumber. When no reserved driver remains (all busy, all
 *   refused, or none checked in), the order falls through to general FIFO.
 * - **HOW (advance):** because the priority above reorders candidates by
 *   reservation FIRST, the old advance mechanism (a `queueNumber > ?` cursor)
 *   became unsafe — after a high-position reserved driver rejected, that cursor
 *   would also drop lower-numbered general drivers that were still eligible.
 *   Skipped drivers are therefore excluded by **driver id** (NOT IN on
 *   `vehicleDriverUniqueId`) instead of by queue position.
 *
 * - **WHEN:** every FIFO offer — order-creation auto-dispatch
 *   (handleQueueDispatch), check-in rescan (rescanPendingQueueOrder), and every
 *   advance after reject / timeout / cancel / expiry (offerToNextDriver paths).
 *   Targeted dispatch (2/3) is NOT re-prioritized; a named driver is honored
 *   only if they are not reserved for a different shipper.
 *
 * - **WHO:** requirement specified by the project owner (the reserving shipper
 *   has full right to their targeted drivers); implemented in the `offerToDriver`
 *   selection rework. Behavior is testable as TQ-14A / TQ-14B / TQ-14C in
 *   `docs/testing/queue-process-test-plan.md`.
 *
 * The driver is selected in ONE of three ways:
 *   1. FIFO (default): the FRONT waiting driver of the order's vehicle type.
 *      Drivers reserved for a DIFFERENT shipper than this order's creator are
 *      never considered; drivers this shipper reserved (`targetedShipperUserUUID`
 *      = the order creator) are offered BEFORE general (unreserved) drivers.
 *      `excludeVehicleDriverUniqueId` skips a specific driver.
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
 * BATCH-REFUSAL RULE (FIFO scans only): when the order belongs to a batch
 * (`shipperRequest.shipperRequestBatchUniqueId`), a driver who declined ANY
 * order of that batch ("said no" statuses — see
 * BATCH_DECLINED_JOURNEY_STATUSES) is also skipped, so one decline cools the
 * whole batch. Targeted dispatch (mode 2/3) is EXEMPT and can reconnect the
 * batch to a cooled driver on purpose.
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
 * @param {string} [params.excludeVehicleDriverUniqueId] - FIFO: skip this driver.
 *   Seeds the driver-id exclusion set (replaces the legacy queueNumber cursor).
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

  // Excluded-driver set — WHY/HOW: drivers once skipped mid-scan (reserved for
  // a different shipper, or with no active DriverRequest) are excluded by their
  // driver id (NOT IN) instead of by a `queueNumber > ?` cursor. Reservation
  // priority reorders candidates by (matched reservation, queueNumber), so the
  // old cursor would have also dropped lower-numbered GENERAL drivers after a
  // high-position reserved driver was passed; an id-based set lets the scan fall
  // through to general drivers once the reserved fleet is exhausted.
  // `excludeVehicleDriverUniqueId` (advance/reject/timeout/cancel) seeds it; the
  // `NOT EXISTS` on JourneyDecisions makes refusal exclusion redundant but kept
  // as the authoritative guard.
  const excludedVehicleDriverUniqueIds = new Set();
  if (excludeVehicleDriverUniqueId) {
    excludedVehicleDriverUniqueIds.add(excludeVehicleDriverUniqueId);
  }

  while (true) {
    /**
     * Find the front waiting driver for a vehicle type in a queue org.
     * Joins: DriverQueue → VehicleDriver → Vehicle (for vehicleTypeUniqueId filter)
     *        → Users (for driver phone/name in socket notification).
     * Uses FOR UPDATE to lock the row while we create the offer, preventing
     * concurrent dispatches from offering the same driver twice.
     * In FIFO mode the scan reaches THIS shipper's reserved drivers first
     * (targetedShipperUserUUID = order creator), then general (unreserved)
     * drivers, and never drivers reserved for a DIFFERENT shipper.
     */
    const whereParts = [
      `dq.queueOrganizationUniqueId = ?`,
      `dq.queueDate = ?`,
      isTargeted
        ? `(dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT}) OR (dq.status = ${QUEUE_STATUS.REQUESTED} AND dq.shipperRequestUniqueId = ?))`
        : `dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT})`,
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
    if (!isTargeted) {
      // Requirement 1 (shipper's right, protect): never even SELECT drivers
      // reserved for a DIFFERENT shipper than this order's creator — the
      // reservation is exclusive, so "stealing" by SQL is impossible.
      whereParts.push(
        `(dq.targetedShipperUserUUID IS NULL OR dq.targetedShipperUserUUID = ?)`,
      );
      queryParams.push(shipperRequest.userUniqueId);
    }
    if (targetQueueUniqueId) {
      whereParts.push(`dq.queueUniqueId = ?`);
      queryParams.push(targetQueueUniqueId);
    }
    if (targetVehicleDriverUniqueId) {
      whereParts.push(`dq.vehicleDriverUniqueId = ?`);
      queryParams.push(targetVehicleDriverUniqueId);
    }
    if (excludedVehicleDriverUniqueIds.size > 0) {
      whereParts.push(
        `dq.vehicleDriverUniqueId NOT IN (${Array.from(
          excludedVehicleDriverUniqueIds,
        )
          .map(() => "?")
          .join(", ")})`,
      );
      queryParams.push(...excludedVehicleDriverUniqueIds);
    }
    whereParts.push(`NOT EXISTS (
           SELECT 1 FROM JourneyDecisions jd
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE jd.shipperRequestId = ?
             AND dr.userUniqueId = vd.driverUserUniqueId
             AND jd.journeyStatusId IN (?, ?, ?, ?)
         )`);
    queryParams.push(...skipRejectedParams);

    // BATCH-REFUSAL RULE — automatic FIFO scans only. A driver who declined ANY
    // order of THIS order's batch (a JourneyDecision on any non-deleted order
    // sharing shipperRequestBatchUniqueId with a "said no" status) is skipped,
    // so one decline cools every job of the batch. Targeted manual dispatch
    // (targetQueueUniqueId / targetVehicleDriverUniqueId) is EXEMPT — an admin
    // can always reconnect a driver to a batch order. Orders without a batch
    // (NULL) or with a different batch id never match.
    if (!isTargeted && shipperRequest.shipperRequestBatchUniqueId) {
      whereParts.push(`NOT EXISTS (
           SELECT 1 FROM JourneyDecisions jd2
           JOIN DriverRequest dr2 ON dr2.driverRequestId = jd2.driverRequestId
           JOIN ShipperRequest sr2 ON sr2.shipperRequestId = jd2.shipperRequestId
           WHERE sr2.shipperRequestBatchUniqueId = ?
             AND sr2.shipperRequestDeletedAt IS NULL
             AND dr2.userUniqueId = vd.driverUserUniqueId
             AND jd2.journeyStatusId IN (?, ?, ?)
         )`);
      queryParams.push(
        shipperRequest.shipperRequestBatchUniqueId,
        ...BATCH_DECLINED_JOURNEY_STATUSES,
      );
    }

    // Requirement 2 (shipper's right, redirect): offer THIS shipper's reserved
    // drivers first, then general (unreserved) drivers, each group by
    // queueNumber ASC, so a shipper's targeted fleet always outranks general
    // drivers regardless of queue position. The ORDER BY placeholder reuses the
    // order creator's userUniqueId and is appended after all WHERE params.
    const orderByClause = isTargeted
      ? `dq.queueNumber ASC`
      : `CASE WHEN dq.targetedShipperUserUUID = ? THEN 0 ELSE 1 END, dq.queueNumber ASC`;
    if (!isTargeted) {
      queryParams.push(shipperRequest.userUniqueId);
    }

    const [front] = await txExecutor.query(
      `SELECT dq.*, vd.driverUserUniqueId, u.phoneNumber, u.fullName
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
       WHERE ${whereParts.join(" AND ")}
       ORDER BY ${orderByClause} LIMIT 1
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
    // because the WHERE clause only admits REQUESTED rows in targeted mode.
    if (isTargeted && entry.status === QUEUE_STATUS.REQUESTED) {
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
            status: QUEUE_STATUS.REQUESTED,
          },
        };
      }
    }

    // EXCLUSIVE RESERVATION: if this driver targeted a specific shipper via
    // phone at check-in, only offer them orders from that shipper. In FIFO the
    // WHERE clause already excludes drivers reserved for a different shipper;
    // this guard remains as a safety net (and enforces the 400 in targeted mode).
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
      excludedVehicleDriverUniqueIds.add(entry.vehicleDriverUniqueId);
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
      excludedVehicleDriverUniqueIds.add(entry.vehicleDriverUniqueId);
      continue;
    }

    // NO-ANSWER RETENTION RELEASE: an order surviving its offer window can be
    // sitting on a `no_answer_from_driver` entry (16, order still attached —
    // the timeout sweep keeps it there so the first driver's late accept is
    // still honoured). Now that we have found a CONCRETE next driver for this
    // order, that retention must be released BEFORE the new offer is created
    // (otherwise the same order ends up linked to two entries). The released
    // holder keeps their line position (18) and stays in queue; the late-accept
    // gate on markEntryAgreed then rejects the first driver with "order passed
    // to another driver". Locks the stale holder row so concurrent advance +
    // late-accept serialize.
    const [staleHolders] = await txExecutor.query(
      `SELECT queueId, queueUniqueId, queueOrganizationUniqueId, queueDate
       FROM DriverQueue
       WHERE shipperRequestUniqueId = ? AND status = ${QUEUE_STATUS.NO_ANSWER_FROM_DRIVER}
         AND queueDeletedAt IS NULL AND queueId <> ?
       FOR UPDATE`,
      [shipperRequestUniqueId, entry.queueId],
    );
    for (const stale of staleHolders) {
      await logQueueHistory(txExecutor, {
        queueUniqueId: stale.queueUniqueId,
        event: HISTORY_EVENT.ADVANCE_RELEASE,
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
        conditions: { queueId: stale.queueId },
      });
      await emitQueueSnapshot({
        queueOrganizationUniqueId: stale.queueOrganizationUniqueId,
        queueDate: stale.queueDate,
      });
    }

    const offerResult = await createQueueOffer(txExecutor, {
      shipperRequest,
      driverRequest,
      user,
    });

    await logQueueHistory(txExecutor, {
      queueUniqueId: entry.queueUniqueId,
      event: HISTORY_EVENT.OFFER,
      performedBy: user.userUniqueId,
    });

    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: QUEUE_STATUS.REQUESTED,
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
        status: QUEUE_STATUS.REQUESTED,
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
 *   queueNumber, driverUserUniqueId, journeyDecisionUniqueId, status: ${QUEUE_STATUS.REQUESTED} } }`.
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
           AND dq.status = ${QUEUE_STATUS.REQUESTED}
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
      user,
      throwIfNone: false,
    });
    if (result?.offered) {
      return result;
    }
  }
  return { offered: false, data: null };
};

/**
 * Arm the org's currently-FREE queued drivers for order-anchored bid matching.
 *
 * Used at BID ORDER CREATION (Step 2c): findNearbyDrivers only sees drivers who
 * already hold an eligible (waiting/rejectedByDriver) DriverRequest, so a driver
 * who is already in line but whose only request is terminal would never be
 * invited to the just-created board job. This re-arms each free queued driver
 * with a waiting request anchored at their CURRENT queue-entry coordinates, so
 * findNearbyDrivers finds them and isQueued DESC offers them first.
 *
 * Contention policy (matches the check-in pull): a driver whose single active
 * request is engaged elsewhere is SKIPPED — never force-released. The queue
 * waits for the timeout sweepers to clear the foreign hold.
 *
 * Best-effort — a failure to arm one driver never blocks the creation flow.
 *
 * @returns {Promise<void>}
 */
const ensureQueuedDriversReadyForBid = async ({
  queueOrganizationUniqueId,
  vehicleTypeUniqueId,
}) => {
  try {
    const executor = transactionStorage.getStore() || db();
    const [rows] = await executor.query(
      `SELECT dq.vehicleDriverUniqueId, vd.driverUserUniqueId,
              dq.driverLatitude, dq.driverLongitude
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v ON v.vehicleUniqueId = vd.vehicleUniqueId
       WHERE dq.queueOrganizationUniqueId = ?
         AND dq.queueDate = ?
         AND v.vehicleTypeUniqueId = ?
         -- WAITING = in line, free; CANCELLED_BEFORE_ACCEPT = rejected last
         -- offer but kept position, still eligible for the next one.
         AND dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT})
         AND dq.queueDeletedAt IS NULL`,
      [queueOrganizationUniqueId, today(), vehicleTypeUniqueId],
    );
    if (rows.length === 0) return;

    const {
      ensureWaitingDriverRequest,
    } = require("./ShipperRequest/statusVerification.service");
    for (const entry of rows) {
      try {
        await ensureWaitingDriverRequest(
          executor,
          entry.driverUserUniqueId,
          queueOrganizationUniqueId,
          {
            latitude: entry.driverLatitude,
            longitude: entry.driverLongitude,
            place: "Queue check-in",
          },
        );
      } catch (error) {
        logger.warn("ensureQueuedDriversReadyForBid: arm failed", {
          error: error.message,
          driverUserUniqueId: entry.driverUserUniqueId,
        });
      }
    }
  } catch (error) {
    logger.error("Error in ensureQueuedDriversReadyForBid", {
      error: error.message,
      stack: error.stack,
      queueOrganizationUniqueId,
      vehicleTypeUniqueId,
    });
  }
};
exports.ensureQueuedDriversReadyForBid = ensureQueuedDriversReadyForBid;

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
     WHERE dq.queueDate = ? AND dq.status IN (${QUEUE_STATUS.WAITING}, ${QUEUE_STATUS.CANCELLED_BEFORE_ACCEPT}) AND dq.queueDeletedAt IS NULL
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
 * Advance the offer — offer the order to the NEXT waiting driver in line.
 * Used when the front driver rejects or times out: the driver keeps their
 * position (`waiting`), the ORDER advances. Returns `{ offered: false }` when
 * no further driver of that type is waiting.
 */
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

/**
 * Offer-window timeout (implicit, PASSIVE) — find every entry that is still
 * `requested` past the window with a linked order still `requested`, mark the
 * decision + driver request free (implicit no-answer), and move the entry to
 * `no_answer_from_driver` (16) RETAINING the order so the first driver's late
 * accept (after the window, while nobody else has taken the order) is still
 * honoured. The order is then offered to the NEXT waiting driver of the same
 * vehicle type; if one exists, offerToDriver's stale-holder release detaches
 * the order from the 16-entry (position kept, still in line) and the advance
 * completes; if none exists the order stays on the 16-entry until a later
 * check-in/rescan or the first driver's late accept. Called by the background
 * automatic-timeout scan. `actor` is the user stamped on the audit trail (the
 * order's creator).
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
     JOIN QueueOrganization o ON o.queueOrganizationUniqueId = dq.queueOrganizationUniqueId
       AND o.isDeleted = 0
     WHERE dq.status = ${QUEUE_STATUS.REQUESTED} AND dq.queueDeletedAt IS NULL
       AND dq.requestedAt IS NOT NULL AND dq.requestedAt < ?
       AND sr.journeyStatusId = ?
     ORDER BY dq.requestedAt ASC`,
    [journeyStatusMap.requested, cutoff, journeyStatusMap.requested],
  );

  const advanced = [];
  for (const entry of expired) {
    const actor = { userUniqueId: entry.shipperRequestCreatedBy };
    const now = currentDate();

    // NO-ANSWER RETENTION: move to 16 but KEEP the order attached. Unlike an
    // active reject (which frees the order at once), the first driver keeps the
    // right to a late accept while nobody else has taken the order. Only when a
    // concrete next driver is found does offerToDriver release this retention.
    // The first driver's request + decision are deliberately LEFT at `requested`
    // here so the late accept can still land (the accept flow requires the
    // decision at `requested`); they are terminalized to noAnswerFromDriver
    // below ONLY when the order actually advances to another driver.
    await logQueueHistory(executor, {
      queueUniqueId: entry.queueUniqueId,
      event: HISTORY_EVENT.OFFER_TIMEOUT,
      performedBy: actor.userUniqueId,
    });
    await updateData({
      tableName: "DriverQueue",
      updateValues: {
        status: QUEUE_STATUS.NO_ANSWER_FROM_DRIVER,
        requestedAt: null,
        queueUpdatedAt: now,
        queueUpdatedBy: actor.userUniqueId,
      },
      conditions: { queueId: entry.queueId },
    });

    await applyRefusalPolicy({ executor, entry, user: actor });

    // Tell the released driver their offer window expired — the app otherwise
    // keeps showing the offer card (or silently drops it on the next poll) with
    // no explanation. Best-effort: offline driver is covered by the REST poll.
    if (entry.driverPhoneNumber) {
      await sendSocketIONotificationToDriver({
        phoneNumber: entry.driverPhoneNumber,
        eventName: "queue",
        message: {
          messageTypes: messageTypes.queue_order_rejected,
          message: "Offer window expired",
          status: null,
          queue: {
            queueOrganizationUniqueId: entry.queueOrganizationUniqueId,
            queueUniqueId: entry.queueUniqueId,
            queueNumber: entry.queueNumber,
            status: QUEUE_STATUS.NO_ANSWER_FROM_DRIVER,
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
      excludeVehicleDriverUniqueId: entry.vehicleDriverUniqueId,
      shipperRequestUniqueId: entry.shipperRequestUniqueId,
      user: actor,
    });

    if (next.offered) {
      // The order is now on ANOTHER driver's entry — the first driver's
      // late accept must be rejected. Terminalize their still-`requested`
      // decision + request to noAnswerFromDriver(16) so (a) the accept flow's
      // `requested` status check fails and the queue pre-gate returns 409
      // ("passed to another driver"), and (b) their NEXT offer is not blocked
      // by a dead active request on the uq_driver_active_request unique index.
      // NOTE: offerToDriver already released the stale 16-entry (→18, order
      // cleared), so no queue-entry write is needed here.
      await executor.query(
        `UPDATE JourneyDecisions jd
         JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
         JOIN ShipperRequest sr ON sr.shipperRequestId = jd.shipperRequestId
         SET jd.journeyStatusId = ?,
             jd.journeyDecisionUpdatedAt = ?,
             jd.journeyDecisionUpdatedBy = ?,
             jd.isCancellationByDriverSeenByShipper = 'no need to see it',
             dr.journeyStatusId = ?,
             dr.driverRequestUpdatedAt = ?,
             dr.driverRequestUpdatedBy = ?
         WHERE sr.shipperRequestUniqueId = ? AND dr.userUniqueId = ?
           AND dr.journeyStatusId = ? AND jd.journeyStatusId = ?`,
        [
          journeyStatusMap.noAnswerFromDriver,
          now,
          actor.userUniqueId,
          journeyStatusMap.noAnswerFromDriver,
          now,
          actor.userUniqueId,
          entry.shipperRequestUniqueId,
          entry.driverUserUniqueId,
          journeyStatusMap.requested,
          journeyStatusMap.requested,
        ],
      );
    }

    // A found next driver already detached the order via offerToDriver's
    // stale-holder release (16 → 18, order cleared); the shipper is told the
    // order moved on. When nothing is available, the order stays retained on
    // the 16-entry for the first driver's late accept.
    await notifyShipperOfQueueEvent({
      executor,
      shipperRequestUniqueId: entry.shipperRequestUniqueId,
      messageType: "queue_order_reoffered",
      message: next.offered
        ? "The driver did not respond in time; your order was passed to the next driver."
        : "The driver did not respond in time. The order stays available for your reserved queue; you will be notified once a driver accepts.",
    });
    advanced.push({ queueUniqueId: entry.queueUniqueId, ...next });
  }

  return { message: "success", data: { released: advanced.length, advanced } };
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
    const meta = new Set(["historyUniqueId", "historyEvent", "performedBy", "performedAt"]);
    const value = (v) =>
      v === undefined || v === null ? "" : v instanceof Date ? v.toISOString() : String(v);
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

module.exports = exports;
