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
  LIVE_ENTRY_STATUSES,
  QUEUE_STATUS,
  HISTORY_EVENT,
  logQueueHistory,
  publicEntry,
  buildDriverPhotoMap,
  buildQueueEntry,
  terminalizeQueueOrderRequest,
  hasActiveJob,
  yardAccessWithShipperTurn,
  stageNameFor,
  servingShipperFor,
  resolveActiveOrderForDriver,
  hasActiveJourney,
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
      `SELECT dq.*, vd.driverUserUniqueId, v.vehicleTypeUniqueId, dq.queueOrganizationUniqueId,
              sr.userUniqueId AS orderShipperUserUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
       LEFT JOIN ShipperRequest sr
         ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
         AND sr.shipperRequestDeletedAt IS NULL
       WHERE dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
         AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL
         AND dq.status IN (${LIVE_ENTRY_STATUSES.join(", ")})
       ORDER BY dq.queueNumber DESC LIMIT 1`,
      [queueOrganizationUniqueId, queueDate, user.userUniqueId],
    );
  } else {
    // FENCE: driver can only be in one queue system-wide — search all orgs
    [rows] = await executor.query(
      `SELECT dq.*, vd.driverUserUniqueId, v.vehicleTypeUniqueId, dq.queueOrganizationUniqueId,
              sr.userUniqueId AS orderShipperUserUniqueId
       FROM DriverQueue dq
       JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
       JOIN Vehicle v          ON v.vehicleUniqueId        = vd.vehicleUniqueId
       LEFT JOIN ShipperRequest sr
         ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
         AND sr.shipperRequestDeletedAt IS NULL
       WHERE dq.queueDate = ?
         AND vd.driverUserUniqueId = ? AND dq.queueDeletedAt IS NULL
         AND dq.status IN (${LIVE_ENTRY_STATUSES.join(", ")})
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

  // Read-side healing for legacy entries (AGREED by the pre-linkage bid path,
  // no stored linkage): resolve the driver's actually-accepted order from their
  // active journey decision so activeOrder is populated everywhere. No writes.
  let activeOrderUniqueId = rows[0].shipperRequestUniqueId || null;
  const jobHolder = hasActiveJob(rows[0].status);
  if (jobHolder && !activeOrderUniqueId) {
    activeOrderUniqueId = await resolveActiveOrderForDriver(
      executor,
      rows[0].driverUserUniqueId,
    );
  }

  // Shipper-turn overlay (level 1 of the two-level yard rule): an AGREED
  // holder may still HOLD when another shipper is being served at the yard.
  const yardAccess = await yardAccessWithShipperTurn(executor, rows[0]);

  // The ORDER's journey stage. DriverQueue.status tracks the queue-entry
  // bookkeeping (16 = last offer timed out) and deliberately does not mirror
  // the order stage, so `journeyStatusId` is resolved from the driver's live
  // JourneyDecisions here. ACTIVE_JOURNEY_STATUSES covers `requested` (2), so a
  // driver who is connected to a shipper but has not accepted yet still
  // reports 2 rather than dropping to null.
  const liveJourney = await hasActiveJourney(
    executor,
    rows[0].driverUserUniqueId,
  );

  return {
    message: "success",
    data: {
      queue: {
        ...publicEntry(rows[0], {
          orderJourneyStatusId: liveJourney?.journeyStatusId ?? null,
        }),
        waitingAhead: ahead[0].total,
        // Two-number model: queueNumber is the immutable arrival number;
        // linePosition is the DERIVED turn counting only drivers still
        // waiting for a job (status 1/2/16/18). Job holders leave the line,
        // so everyone behind them shifts up automatically. null while the
        // driver holds a job (they are out of the waiting line).
        linePosition: jobHolder ? null : ahead[0].total + 1,
        // Job/yard authority — computed, never stored.
        hasActiveJob: jobHolder,
        yardAccess,
        // Which order the driver holds. The stage is NOT repeated here as a
        // name: journeyStatusId above is the single source for order progress
        // (read from JourneyDecisions, not DriverQueue.status).
        activeOrder: jobHolder
          ? {
              shipperRequestUniqueId: activeOrderUniqueId,
            }
          : null,
      },
      shipper,
      shipperHistory,
      organization: orgRows[0] || null,
    },
  };
};
/**
 * YARD GATE CHECK — read-only verdict for the loading-yard gate.
 *
 * The yard's authority is the driver's JOB, not their queueNumber: PASS ⇔ the
 * entry holds an active order (status 3/5/6/7/8). HOLD carries a machine-
 * readable reason (waiting_for_job_offer / offer_pending_accept /
 * reserved_not_assigned / not_in_queue) so staff can answer a "queue number 1
 * says it's my turn" dispute with the system's truth instead of the number.
 *
 * @param {string} queueUniqueId - DriverQueue entry UUID (scanned/typed at the gate)
 * @returns {Promise<object>} { message, data: { verdict, reason, queue, driver, vehicle, order } }
 * @throws {AppError} 404 when the entry does not exist (or is soft-deleted)
 */
exports.yardPass = async (queueUniqueId) => {
  const executor = db();
  const [rows] = await executor.query(
    `SELECT dq.*, vd.driverUserUniqueId,
            u.fullName AS driverFullName, u.phoneNumber AS driverPhoneNumber,
            v.licensePlate, vt.vehicleTypeName,
            sr.shippableItemName, sr.userUniqueId AS orderShipperUserUniqueId,
            su.fullName AS orderShipperFullName
     FROM DriverQueue dq
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
     JOIN Vehicle v        ON v.vehicleUniqueId        = vd.vehicleUniqueId
     JOIN VehicleTypes vt  ON vt.vehicleTypeUniqueId   = v.vehicleTypeUniqueId
     JOIN Users u          ON u.userUniqueId           = vd.driverUserUniqueId
     LEFT JOIN ShipperRequest sr
       ON sr.shipperRequestUniqueId = dq.shipperRequestUniqueId
       AND sr.shipperRequestDeletedAt IS NULL
     LEFT JOIN Users su ON su.userUniqueId = sr.userUniqueId
     WHERE dq.queueUniqueId = ? AND dq.queueDeletedAt IS NULL
     LIMIT 1`,
    [queueUniqueId],
  );
  if (rows.length === 0) {
    throw new AppError("Queue entry not found", AppError.NOT_FOUND);
  }
  const row = rows[0];
  // Two-level yard rule: base verdict (job = authority), then the shipper-turn
  // overlay — an AGREED truck of a NON-serving shipper HOLDs at the entrance
  // (waiting_shipper_turn); status 5+ trucks are already at the bay and PASS.
  const yardAccess = await yardAccessWithShipperTurn(executor, row);
  const servingShipperUserUniqueId = yardAccess.servingShipperUserUniqueId ?? null;
  let servingShipper = null;
  if (servingShipperUserUniqueId) {
    const [servingRows] = await executor.query(
      `SELECT userUniqueId, fullName, phoneNumber
       FROM Users WHERE userUniqueId = ? AND isDeleted = 0 LIMIT 1`,
      [servingShipperUserUniqueId],
    );
    servingShipper = servingRows[0] || null;
  }
  const stage = stageNameFor(row.status);
  const shared = {
    queue: {
      queueUniqueId: row.queueUniqueId,
      queueOrganizationUniqueId: row.queueOrganizationUniqueId,
      queueNumber: row.queueNumber,
      loadingOrderNumber: row.loadingOrderNumber ?? null,
      status: row.status,
      stage,
    },
    driver: {
      driverUserUniqueId: row.driverUserUniqueId,
      fullName: row.driverFullName || null,
      phoneNumber: row.driverPhoneNumber || null,
    },
    vehicle: {
      licensePlate: row.licensePlate || null,
      vehicleTypeName: row.vehicleTypeName || null,
    },
  };
  if (yardAccess.verdict === "PASS") {
    return {
      message: "Yard pass granted — driver holds an active job",
      data: {
        verdict: "PASS",
        reason: null,
        ...shared,
        servingShipper: servingShipper || null,
        order: {
          shipperRequestUniqueId: row.shipperRequestUniqueId || null,
          shippableItemName: row.shippableItemName || null,
          shipperName: row.orderShipperFullName || null,
        },
      },
    };
  }
  return {
    message:
      yardAccess.reason === "waiting_shipper_turn"
        ? "Yard pass held — another shipper's turn at the loading yard"
        : "Yard pass denied — driver does not hold an active job",
    data: {
      verdict: "HOLD",
      reason: yardAccess.reason,
      ...shared,
      servingShipper: servingShipper || null,
      order:
        yardAccess.reason === "waiting_shipper_turn"
          ? {
              shipperRequestUniqueId: row.shipperRequestUniqueId || null,
              shippableItemName: row.shippableItemName || null,
              shipperName: row.orderShipperFullName || null,
            }
          : null,
    },
  };
};
/**
 * Driver leaves the queue (checkout / no-show) — entry marked terminal.
 * If queueOrganizationUniqueId provided, scope to that org; otherwise find via fence.
 *
 * Scans ALL live statuses (waiting AND job holders) so a job holder is never
 * told "not in the queue" while myPosition still shows their entry:
 *   - Waiting entries (1/2/16/18)  → normal checkout; a held offer (2/16) is
 *     released to the next driver of the same vehicle type.
 *   - Job holder WITH an order (3/5/6/7/8, linkage resolvable — direct or
 *     legacy-healed) → 409: the job must leave by its own door (driver
 *     cancel-after-accept / journey completion / shipper cancel), never by
 *     checkout — otherwise the order would be orphaned from the queue side
 *     while the journey continues.
 *   - LEGACY AGREED GHOST (status 3, NO order linkage anywhere) → allowed.
 *     These are pre-accept-linkage rows whose bid decision never resolved
 *     (e.g. the order was cancelled or the linkage was never written); the
 *     driver is stuck as a phantom job holder with no order to cancel, so
 *     checkout is the only way out.
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
         AND vd.driverUserUniqueId = ? AND dq.status IN (${LIVE_ENTRY_STATUSES.join(", ")})
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
       WHERE dq.queueDate = ? AND vd.driverUserUniqueId = ? AND dq.status IN (${LIVE_ENTRY_STATUSES.join(", ")})
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

  // A job holder cannot walk out of an ACCEPTED order through checkout — the
  // order must be cancelled/completed through its own flow (which releases
  // the entry and re-offers it). Exception: the legacy AGREED GHOST (status 3
  // with no order linkage anywhere) — nothing to cancel, so allow checkout.
  if (hasActiveJob(rows[0].status)) {
    const linkedOrder =
      rows[0].shipperRequestUniqueId ||
      (await resolveActiveOrderForDriver(executor, user.userUniqueId));
    if (linkedOrder) {
      throw new AppError(
        "You hold an active job — cancel the order or complete the journey before leaving the queue",
        AppError.CONFLICT,
      );
    }
  }

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
