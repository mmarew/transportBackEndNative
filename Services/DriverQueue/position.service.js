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
const logger = require("../../Utils/logger");
const { listOfDocumentsTypeAndId } = require("../../Utils/ListOfSeedData");
const {
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../../CRUD/Read/ReadData");
const {
  today,
  IN_QUEUE_STATUSES,
  QUEUE_STATUS,
  HISTORY_EVENT,
  logQueueHistory,
  publicEntry,
  buildDriverPhotoMap,
  buildQueueEntry,
  terminalizeQueueOrderRequest,
} = require("./helpers");
const { offerToNextDriver } = require("./release.service");
const { notifyShipperOfQueueEvent } = require("./dispatch-notify");

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
  const podIds = [...new Set(rows.map((r) => r.podUniqueId).filter(Boolean))];
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
      podByDC
        .get(p.deliveryConfirmationUniqueId)
        .push(p.deliveryConfirmationPhotoUrl);
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
        requested: rows.filter((r) => r.status === QUEUE_STATUS.REQUESTED)
          .length,
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
