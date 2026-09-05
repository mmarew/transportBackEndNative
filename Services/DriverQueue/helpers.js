"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const { DOMAIN } = require("../../Utils/Constants");
const AppError = require("../../Utils/AppError");
const { createData } = require("../../CRUD/Create/CreateData");
const { journeyStatusMap, listOfDocumentsTypeAndId } = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");

const today = () => new Date().toISOString().slice(0, 10); // eslint-disable-line no-magic-numbers -- YYYY-MM-DD;
const QUEUE_OFFER_WINDOW_MINUTES = 3;
const QUEUE_REFUSAL_LIMIT =
  Number(process.env.QUEUE_REFUSAL_LIMIT) || DOMAIN.DEFAULT_QUEUE_REFUSAL_LIMIT;
const MAX_OFFERS_PER_SWEEP = 50;

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


module.exports = {
  today,
  QUEUE_OFFER_WINDOW_MINUTES,
  QUEUE_REFUSAL_LIMIT,
  MAX_OFFERS_PER_SWEEP,
  IN_QUEUE_STATUSES,
  ACTIVE_JOURNEY_STATUSES,
  queueOrgReady,
  logQueueHistory,
  getVehicleDriverType,
  getVehicleDriverByPhone,
  nextQueueNumber,
  publicEntry,
  buildDriverPhotoMap,
  buildQueueEntry,
};
