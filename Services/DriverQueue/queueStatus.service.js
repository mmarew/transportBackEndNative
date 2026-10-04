"use strict";

const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const {
  today,
  QUEUE_STATUS,
  buildDriverPhotoMap,
  buildQueueEntry,
  hasActiveJob,
  servingShipperFor,
} = require("./helpers");

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
            dq.requestedAt, dq.agreedAt, dq.loadingOrderNumber,
            dq.vehicleDriverUniqueId,
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
  // YARD LANES — the board's answer to "whose turn is it at the loading yard?":
  //   loadingNow — drivers HOLDING A JOB (status 3/5/6/7/8). The lane IS
  //                the physical loading line: sorted by the PERSISTED
  //                loadingOrderNumber (ONE continuous sequence per org+day;
  //                legacy rows without
  //                a number last, by agreedAt). Ships GATED so staff see
  //                exactly who may enter: an AGREED truck of a non-serving
  //                shipper carries yardAccess HOLD waiting_shipper_turn, and
  //                lanes.servingShipper names whose turn it is.
  //   waiting    — drivers still waiting for a job, each carrying a derived
  //                linePosition (1..N). Job holders do NOT count, so the line
  //                renumbers itself automatically when someone gets a job
  //                (e.g. #30 takes a job → #31's linePosition becomes 30).
  // `queues` keeps the flat per-type array (backward compatible); `lanes`
  // carries the split. Both entries share the same objects.
  const lanesByType = {};
  for (const row of rows) {
    const typeName =
      row.vehicleTypeName || row.vehicleTypeUniqueId || "Unknown";
    if (!byType[typeName]) byType[typeName] = [];
    if (!lanesByType[typeName]) lanesByType[typeName] = {
      loadingNow: [],
      waiting: [],
    };
    const entry = buildQueueEntry(row, photosByDriver, podByDC);
    byType[typeName].push(entry);
    if (hasActiveJob(row.status)) {
      lanesByType[typeName].loadingNow.push(entry);
    } else {
      entry.queue.linePosition = lanesByType[typeName].waiting.length + 1;
      lanesByType[typeName].waiting.push(entry);
    }
  }

  // LOADING LINE — read straight off the persisted loadingOrderNumber (no
  // per-read recomputation from agreedAt/joinedAt timestamps). ONE continuous
  // sequence per org+day: whoever was accepted first carries the lower number
  // and loads first. Numberless legacy rows sink to the end of the line
  // (agreedAt, then queueNumber as the tie-breaker) instead of displacing the
  // stored rule.
  for (const typeName of Object.keys(lanesByType)) {
    lanesByType[typeName].loadingNow.sort((a, b) => {
      const na = a.queue.loadingOrderNumber;
      const nb = b.queue.loadingOrderNumber;
      if (na !== null && nb !== null && na !== nb) return na - nb;
      if (na !== null && nb === null) return -1;
      if (na === null && nb !== null) return 1;
      const ta = a.queue.agreedAt || a.queue.joinedAt || 0;
      const tb = b.queue.agreedAt || b.queue.joinedAt || 0;
      if (ta !== tb) return new Date(ta) - new Date(tb);
      return a.queue.queueNumber - b.queue.queueNumber;
    });
  }

  // SHIPPER-TURN GATE (level 1 of the two-level yard rule) — one indexed
  // lookup for the whole board: the shipper of the lowest live
  // loadingOrderNumber (the sequence is continuous per org+day, so the
  // lowest is unique) is the serving shipper. Every AGREED (status 3)
  // holder of ANOTHER shipper is marked HOLD waiting_shipper_turn; trucks
  // already at/inside the bay (status 5/6/7/8) are inside by right of work
  // and stay PASS. The board then shows exactly who may enter next.
  const servingShipperUserUniqueId = await servingShipperFor(
    executor,
    queueOrganizationUniqueId,
    queueDate,
  );
  for (const typeName of Object.keys(lanesByType)) {
    for (const entry of lanesByType[typeName].loadingNow) {
      if (entry.queue.status === QUEUE_STATUS.AGREED) {
        const rowForGate = rows.find(
          (r) => r.queueUniqueId === entry.queue.queueUniqueId,
        );
        if (
          rowForGate &&
          rowForGate.orderUserUniqueId &&
          servingShipperUserUniqueId &&
          rowForGate.orderUserUniqueId !== servingShipperUserUniqueId
        ) {
          entry.queue.yardAccess = {
            verdict: "HOLD",
            reason: "waiting_shipper_turn",
          };
        }
      }
    }
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
        // Drivers currently holding a job — the loadingNow lane size.
        loadingNow: rows.filter((r) => hasActiveJob(r.status)).length,
      },
      queues: byType,
      lanes: lanesByType,
      shipperTurn: {
        servingShipperUserUniqueId,
      },
    },
  };
};
