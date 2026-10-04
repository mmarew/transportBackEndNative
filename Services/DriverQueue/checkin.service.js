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
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { checkActiveDriverRequest } = require("../../CRUD/Read/ReadData");
const {
  today,
  QUEUE_STATUS,
  HISTORY_EVENT,
  queueOrgReady,
  validateCheckinDistance,
  resolveShipperUserByPhone,
  logQueueHistory,
  nextQueueNumber,
  hasActiveJourney,
  getDriverQueueState,
  resolveActiveVehicleDriver,
  driverQueueContext,
} = require("./helpers");
const { rescanPendingQueueOrder } = require("./dispatch.service");
const { notifyShipperOfQueueReservation } = require("./dispatch-notify");

/**
 * Single writer for a DriverQueue row — the shared core of check-in and the
 * bid-winner auto-enrollment, so the numbering, insert, duplicate handling and
 * history audit can never drift between the two.
 *
 * Allocates `queueNumber` per (org, date, vehicle type) and inserts the row at
 * the given `status`. Callers own the POLICY fences (idempotent re-check-in,
 * one-queue-per-day, active-engagement) — this function only writes.
 *
 * @param {object} params
 * @param {import("pool").PoolConnection} params.executor Transaction executor.
 * @param {string} params.queueOrganizationUniqueId FK → QueueOrganization.
 * @param {string} params.queueDate YYYY-MM-DD the entry belongs to.
 * @param {object} params.vehicleDriver Resolved active VehicleDriver row.
 * @param {string} params.createdBy Actor userUniqueId (driver, or admin/auto).
 * @param {number} [params.status] QUEUE_STATUS to insert at. Defaults WAITING
 *   (a driver joining the line); auto-enrollment passes AGREED so the driver
 *   never transiently appears as a waiting driver to board readers.
 * @param {string} [params.historyEvent] History vocabulary for the snapshot.
 * @returns {Promise<{queueUniqueId: string, queueNumber: number, duplicate: boolean}>}
 *   `duplicate: true` means the unique key rejected the insert because a
 *   concurrent transaction already created the entry.
 */
const insertQueueEntryRow = async ({
  executor,
  queueOrganizationUniqueId,
  queueDate,
  vehicleDriver,
  createdBy,
  status = QUEUE_STATUS.WAITING,
  historyEvent = HISTORY_EVENT.CHECKIN,
  targetedShipperUserUUID = null,
  driverLatitude = null,
  driverLongitude = null,
  loadingOrderNumber = null,
  shipperRequestUniqueId = null,
  agreedAt = null,
}) => {
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
        vehicleDriverUniqueId: vehicleDriver.vehicleDriverUniqueId,
        targetedShipperUserUUID,
        driverLatitude,
        driverLongitude,
        joinedAt: currentDate(),
        status,
        // Written only when the caller supplies them (auto-enrollment); a normal
        // check-in leaves them NULL so the yard number is still issued at accept.
        ...(loadingOrderNumber !== null
          ? { loadingOrderNumber, agreedAt, shipperRequestUniqueId }
          : {}),
        queueCreatedBy: createdBy,
      },
    });
  } catch (error) {
    // ER_DUP_ENTRY = the (org, date, vehicleType, queueNumber) unique key lost a
    // race with a concurrent enrollment. Reported, not thrown, so the caller
    // decides whether that is a conflict (check-in) or an idempotent no-op.
    if (error.code === "ER_DUP_ENTRY") {
      return { queueUniqueId, queueNumber, duplicate: true };
    }
    throw error;
  }

  await logQueueHistory(executor, {
    queueUniqueId,
    event: historyEvent,
    performedBy: createdBy,
  });

  return { queueUniqueId, queueNumber, duplicate: false };
};

exports.insertQueueEntryRow = insertQueueEntryRow;

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
exports.checkin = async (data) => {
  // here verify driver status first, verifyDriverJourneyStatus is. used to solve this problem

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

  // FENCE: queue mode and the on-demand market are mutually exclusive. A
  // driver ALREADY checked into a queue keeps taking the queue path (the live
  // entry below makes re-check-in idempotent), but a driver holding a WAITING
  // on-demand market request (DriverRequest status 1) must resolve that request
  // first — joining a queue while still waiting for a market job would leave
  // both modes active at once. Uses the canonical checkActiveDriverRequest
  // read; any later status (2 = requested, 3+, journey) is caught by the
  // hasActiveJourney fence below.
  const { active: liveQueueEntry } = await getDriverQueueState(
    executor,
    vehicleDriver.driverUserUniqueId,
    queueDate,
  );
  if (!liveQueueEntry) {
    const activeMarketRequests = await checkActiveDriverRequest(
      vehicleDriver.driverUserUniqueId,
    );
    const waitingMarketRequest = (activeMarketRequests || []).find(
      (req) => Number(req.journeyStatusId) === journeyStatusMap.waiting,
    );
    if (waitingMarketRequest) {
      throw new AppError(
        "You have an active driver request waiting for a job. Resolve it before checking into a queue.",
        AppError.CONFLICT,
      );
    }
  }

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
    // Canonical shape: attach the driverQueue context (two-number model,
    // hasActiveJob, reservation, yardAccess) so re-check-in answers the same
    // questions myPosition/verifyDriverJourneyStatus answer.
    const recheckQueueContext = await driverQueueContext(
      executor,
      user,
      queueOrganizationUniqueId,
    );
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
        driverQueue: recheckQueueContext,
      },
    };
  }

  // Capture the driver's location at check-in time.
  const checkInLat = driverLatitude ?? null;
  const checkInLng = driverLongitude ?? null;

  // The day is clean — the shipper reservation applies from the caller's phone
  // directly (no prior same-day entry to carry a reservation over from).
  const preserveTarget = targetedShipperUserUUID || null;

  // Shared row writer (also used by the bid-winner auto-enrollment) owns the
  // queueNumber allocation, the insert, the duplicate check and the history
  // snapshot.
  const {
    queueUniqueId,
    queueNumber,
    duplicate,
  } = await insertQueueEntryRow({
    executor,
    queueOrganizationUniqueId,
    queueDate,
    vehicleDriver,
    createdBy: user.userUniqueId,
    status: QUEUE_STATUS.WAITING,
    historyEvent: HISTORY_EVENT.CHECKIN,
    targetedShipperUserUUID: preserveTarget,
    driverLatitude: checkInLat,
    driverLongitude: checkInLng,
  });
  if (duplicate) {
    throw new AppError(
      "Driver is already in the queue for this day",
      AppError.CONFLICT,
    );
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
  } = require("../ShipperRequest/statusVerification.service");
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

  // Canonical shape: the fresh entry carries the driverQueue context too
  // (linePosition 1..N among waiting drivers, yardAccess HOLD until a job is
  // assigned). Runs inside the check-in transaction so the fresh row is
  // visible to the context query.
  const freshQueueContext = await driverQueueContext(
    executor,
    user,
    queueOrganizationUniqueId,
  );
  return {
    message: "success",
    data: {
      queueUniqueId,
      queueOrganizationUniqueId,
      queueDate,
      queueNumber,
      position: queueNumber,
      vehicleTypeUniqueId: vehicleDriver.vehicleTypeUniqueId,
      driverQueue: freshQueueContext,
    },
  };
};
