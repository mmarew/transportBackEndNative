"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const { DOMAIN } = require("../../Utils/Constants");
const AppError = require("../../Utils/AppError");
const { updateData } = require("../../CRUD/Update/Data.update");
const { createData } = require("../../CRUD/Create/CreateData");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../../Utils/ListOfSeedData");
const { createUser } = require("../User.service");
const { getVehicleDrivers } = require("../VehicleDriver.service");
const {
  REJECTED_STATUS_IDS: BATCH_DECLINED_JOURNEY_STATUSES,
} = require("../../Utils/RejectedRequests");

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

module.exports = {
  today,
  QUEUE_OFFER_WINDOW_MINUTES,
  QUEUE_REFUSAL_LIMIT,
  MAX_OFFERS_PER_SWEEP,
  QUEUE_STATUS,
  BATCH_DECLINED_JOURNEY_STATUSES,
  HISTORY_EVENT,
  IN_QUEUE_STATUSES,
  ACTIVE_JOURNEY_STATUSES,
  queueOrgReady,
  validateCheckinDistance,
  resolveShipperUserByPhone,
  logQueueHistory,
  nextQueueNumber,
  publicEntry,
  buildDriverPhotoMap,
  buildQueueEntry,
  hasActiveJourney,
  getDriverQueueState,
  resolveActiveVehicleDriver,
  terminalizeQueueOrderRequest,
};
