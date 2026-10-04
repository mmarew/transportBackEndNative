"use strict";

const { db } = require("../CompanyHelper.service");
const { logger } = require("../../Utils/logger");
const { listOfDocumentsTypeAndId } = require("../../Utils/ListOfSeedData");
const {
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../../CRUD/Read/ReadData");
const {
  today,
  IN_QUEUE_STATUSES,
  LIVE_ENTRY_STATUSES,
  publicEntry,
  hasActiveJob,
  yardAccessWithShipperTurn,
  resolveActiveOrderForDriver,
  hasActiveJourney,
} = require("./helpers");

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

  // Driver's own queue-event trail for this yard+day — every event on their
   // entry, starting from check-in.
   //
   // This deliberately does NOT filter on `targetedShipperUserUUID`. An earlier
   // version did, which silently dropped the driver's own check-in and the
   // checkouts before a shipper was attached — so a driver asking "I checked in
   // at 13:18, why does my history start at 13:25?" had no answer, since the
   // reservation was the very thing being hidden. `targetedShipperUserUUID` is
   // still projected (null before reservation) so a consumer can tell which
   // events were shipper-related.
   //
   // `historyEvent` and `status` are part of the projection because performedAt
   // is only second-precision — several DIFFERENT events routinely share a
   // timestamp (e.g. `refusal` + `driver_cancel_after_accept` in the same second),
   // and without the event name/status those rows render as byte-identical
   // duplicates, which reads like a double-write bug. `status` is the entry
   // snapshot at that moment, which separates a repeat of the same event from a
   // genuinely new one.
   const [driverQueueHistory] = await executor.query(
    `SELECT h.historyEvent,
            h.performedAt,
            h.targetedShipperUserUUID,
            h.queueNumber,
            h.status,
            h.shipperRequestUniqueId
     FROM DriverQueueHistory h
     JOIN DriverQueue dq ON dq.queueUniqueId = h.queueUniqueId
     JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
WHERE vd.driverUserUniqueId = ? AND dq.queueOrganizationUniqueId = ? AND dq.queueDate = ?
      ORDER BY h.performedAt DESC, h.historyId DESC LIMIT 10`,
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
      driverQueueHistory,
      organization: orgRows[0] || null,
    },
  };
};
