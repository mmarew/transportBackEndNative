"use strict";

const { pool } = require("../../../Middleware/Database.config");
const {
  findNearbyDrivers,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
} = require("../../../CRUD/Read/ReadData");
const { updateData } = require("../../../CRUD/Update/Data.update");
const { insertData, createData } = require("../../../CRUD/Create/CreateData");
const {
  sendSocketIONotificationToDriver,
} = require("../../../Utils/Notifications");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../../../Utils/ListOfSeedData");
const messageTypes = require("../../../Utils/MessageTypes");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../../Utils/logger");
const { currentDate } = require("../../../Utils/CurrentDate");
const { transactionStorage } = require("../../../Utils/TransactionContext");
const { BATCH_DECLINED_JOURNEY_STATUSES } = require("./constants");

/**
 * Ensure the driver has a `DriverRequest` in `waiting` that can receive a new
 * JourneyDecision. `JourneyDecisions.driverRequestId` is UNIQUE — one decision
 * per driver request — so we reuse only a waiting request that has never been
 * linked to a decision, and create a fresh one otherwise.
 *
 * `origin` (optional) supplies the origin for a freshly minted request (e.g.
 * the driver's last-known position so the fresh request stays visible to
 * nearby-distance scans); falls back to the queue organization's site.
 *
 * Returns `null` when the driver is already holding an active offer elsewhere
 * (their latest request is `requested`) — the caller skips to the next driver.
 * BID-BASE counterpart of DriverQueue.service's FIFO-side helper.
 */
const ensureWaitingDriverRequest = async (
  executor,
  driverUserUniqueId,
  queueOrganizationUniqueId,
  origin = null,
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
  // Prefer the caller-supplied origin (e.g. the driver's last known position so
  // the fresh request stays visible to nearby-distance scans); fall back to the
  // queue organization's site.
  const useOrigin = origin || {
    latitude: org.latitude,
    longitude: org.longitude,
    place: org.queueOrganizationName || "Queue organization",
  };
  const driverRequestUniqueId = uuidv4();
  const inserted = await createData({
    tableName: "DriverRequest",
    insertValues: {
      driverRequestUniqueId,
      userUniqueId: driverUserUniqueId,
      originLatitude: useOrigin.latitude ?? 0,
      originLongitude: useOrigin.longitude ?? 0,
      originPlace: useOrigin.place || "Queue organization",
      journeyStatusId: journeyStatusMap.waiting,
      driverRequestCreatedAt: currentDate(),
    },
  });
  return { driverRequestId: inserted.insertId, driverRequestUniqueId };
};

/**
 * Handles waiting request (status 1) - finds nearby drivers and creates journey decisions
 *
 * Applies the BATCH-REFUSAL RULE: a candidate driver who declined ANY order of
 * the current order's batch (a JourneyDecision with a "said no" status on any
 * non-deleted order sharing `shipperRequestBatchUniqueId`) is skipped, so one
 * decline cools the whole batch for auto-matching. Orders without a batch or
 * with a different batch id are unaffected. Targeted manual dispatch never
 * reaches here.
 *
 * @param {Object} params - Handler parameters
 * @param {Object} params.shipperRequest - Shipper request object
 * @param {number} params.shipperRequestId - Shipper request ID
 * @param {Object} params.totalRecords - Total records for pagination
 * @param {number} params.pageSize - Page size
 * @param {number} params.page - Page number
 * @param {Array} params.driversData - Array to push driver data (shared with handleNonWaitingRequest)
 * @param {Array} params.drivers - Array to push final drivers
 * @param {Array} params.decisions - Array to push final decisions
 * @param {Set} params.notifiedDrivers - Set to track notified drivers
 * @param {string} params.userUniqueId - User unique ID
 * @param {Object} params.connection - Database connection
 * @returns {Promise<boolean>} Returns true if driver was found
 */
async function handleWaitingRequest({
  shipperRequest,
  shipperRequestId,
  totalRecords,
  pageSize,
  page,
  driversData, // unused; kept for API compatibility with callers
  drivers,
  decisions,
  notifiedDrivers,
  userUniqueId,
}) {
  void driversData; // avoid no-unused-vars
  // Find available drivers near the shipper's location (READ-ONLY - outside transaction)
  // Uses radius-based search with distance ordering + FIFO tiebreaker (see ReadData.matching.js).
  const driverResults = await findNearbyDrivers({ shipperRequest });

  if (driverResults.length === 0) {
    return false;
  }

  let driverFound = false;
  const decisionsData = [];
  const driversDataLocal = [];

  for (const driverResult of driverResults) {
    // CRITICAL TRANSACTION BLOCK - driver availability (race condition protection).
    // Must run BEFORE `driver` is built from driverResult, because for a BIDDING
    // order a candidate whose DriverRequest is terminal (rejectedByDriver — refused
    // an EARLIER order, now free) is re-armed with a fresh waiting DriverRequest
    // (JourneyDecisions.driverRequestId is UNIQUE, so the terminal row can never
    // be reused). ensureWaitingDriverRequest returns null when the driver is
    // already holding an active offer elsewhere — skip.
    // DB rows return isBiddingApproved as 1 (tinyint); app objects use boolean
    // true (CreateData normalizes). Accept both.
    const bidFlag = shipperRequest?.isBiddingApproved;
    const isBidOrder =
      Boolean(shipperRequest?.queueOrganizationUniqueId) &&
      (bidFlag === true || bidFlag === 1 || bidFlag === "1");

    const executorAvailability = transactionStorage.getStore() || pool;

    // BATCH-REFUSAL RULE (auto-matching only — a targeted dispatch never reaches
    // handleWaitingRequest): once a driver declined ANY order of this order's
    // batch ("said no" statuses above), they are not auto-offered another order
    // of the SAME batch. The current order's batch id is resolved from DB rather
    // than read off the caller-supplied object (callers pass different shapes),
    // then any JourneyDecision against a non-deleted order sharing that batch id
    // for this driver skips the candidate. Orders without a batch (subquery →
    // NULL) or with a different batch id never match, so single orders and other
    // batches are unaffected.
    const [batchRefused] = await executorAvailability.query(
      `SELECT 1
       FROM JourneyDecisions jd2
       JOIN DriverRequest dr2 ON dr2.driverRequestId = jd2.driverRequestId
       JOIN ShipperRequest sr2 ON sr2.shipperRequestId = jd2.shipperRequestId
       WHERE sr2.shipperRequestBatchUniqueId = (
               SELECT sr0.shipperRequestBatchUniqueId
               FROM ShipperRequest sr0
               WHERE sr0.shipperRequestId = ?
             )
         AND sr2.shipperRequestDeletedAt IS NULL
         AND dr2.userUniqueId = ?
         AND jd2.journeyStatusId IN (?, ?, ?)
       LIMIT 1`,
      [
        shipperRequestId,
        driverResult.driverUserUniqueId,
        ...BATCH_DECLINED_JOURNEY_STATUSES,
      ],
    );
    if (batchRefused[0]?.[0]) {
      continue; // Driver declined a job of this batch — never auto-offer another slot
    }

    if (isBidOrder) {
      const fresh = await ensureWaitingDriverRequest(
        executorAvailability,
        driverResult.driverUserUniqueId,
        shipperRequest.queueOrganizationUniqueId,
        {
          latitude: driverResult.originLatitude,
          longitude: driverResult.originLongitude,
          place: driverResult.originPlace,
        },
      );
      if (!fresh) {
        continue; // Driver holds an active offer elsewhere, skip
      }
      driverResult.driverRequestId = fresh.driverRequestId;
      driverResult.driverRequestUniqueId = fresh.driverRequestUniqueId;
    } else {
      const availabilityCheck = await executorAvailability.query(
        `SELECT COUNT(*) as count FROM DriverRequest
         WHERE driverRequestId = ? AND journeyStatusId = ?`,
        [driverResult.driverRequestId, journeyStatusMap.waiting],
      );

      if (availabilityCheck[0][0].count === 0) {
        continue; // Driver no longer available, skip
      }
    }

    // Pre-fetch profile photo outside critical transaction (READ-ONLY)
    const documents = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
      driverResult.driverUserUniqueId,
      listOfDocumentsTypeAndId.profilePhoto,
    );

    const data = documents?.data;
    const lastDataIndex = data?.length - 1;
    const driverProfilePhoto = data?.[lastDataIndex]?.attachedDocumentName;

    const driver = {
      ...driverResult,
      driverProfilePhoto,
    };

    const vehicle = {
      vehicleUniqueId: driverResult.vehicleUniqueId,
      licensePlate: driverResult.licensePlate,
      color: driverResult.color,
      vehicleTypeName: driverResult.vehicleTypeName,
      vehicleTypeUniqueId: driverResult.vehicleTypeUniqueId,
    };

    // Create journey decision
    const journeyDecisionUniqueId = uuidv4();
    const journeyDecisionPayload = {
      journeyDecisionUniqueId,
      shipperRequestId,
      driverRequestId: driver.driverRequestId,
      journeyStatusId: journeyStatusMap.requested,
      decisionTime: currentDate(),
      //decisionBy is used to track dose shippers request get driver or driver request get shipper request
      decisionBy: "shipper",
      journeyDecisionCreatedBy: userUniqueId,
      journeyDecisionCreatedAt: currentDate(),
    };

    // Create journey decision with error handling for race conditions
    try {
      await insertData({
        tableName: "JourneyDecisions",
        colAndVal: journeyDecisionPayload,
      });
    } catch (error) {
      // Handle duplicate key error (race condition)
      if (
        error.code === "ER_DUP_ENTRY" ||
        error.message?.includes("Duplicate entry") ||
        error.message?.includes("driverRequestId")
      ) {
        logger.warn(
          "Duplicate JourneyDecision detected (race condition), skipping",
          {
            driverRequestId: driver.driverRequestId,
            shipperRequestId: shipperRequestId,
            error: error.message,
          },
        );
        continue; // Skip this driver
      }
      throw error;
    }

    // Update shipper request status
    await updateData({
      tableName: "ShipperRequest",
      conditions: { shipperRequestId },
      updateValues: { journeyStatusId: journeyStatusMap.requested },
    });

    // Update driver request status
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestId: driver.driverRequestId },
      updateValues: { journeyStatusId: journeyStatusMap.requested },
    });
    // END CRITICAL TRANSACTION BLOCK

    // Collect data for notifications (outside transaction)
    driversDataLocal.push({
      driver: { ...driver, driverProfilePhoto },
      vehicle: vehicle,
    });

    decisionsData.push(journeyDecisionPayload);

    // Send notification (outside transaction)
    if (driver?.phoneNumber && !notifiedDrivers.has(driver.phoneNumber)) {
      await sendSocketIONotificationToDriver({
        message: {
          messageTypes: messageTypes.driver_found_shipper_request,
          message: "Driver found for shipper request",
          status: journeyStatusMap.requested,
          shipper: shipperRequest,
          driver: {
            driver: { ...driver, driverProfilePhoto },
            vehicle: vehicle,
          },
          journey: null,
          decisions: journeyDecisionPayload,
          totalRecords,
          pageSize,
          page,
        },
        phoneNumber: driver?.phoneNumber,
      });
      notifiedDrivers.add(driver.phoneNumber);
    }

    driverFound = true;
  }

  drivers.push(...driversDataLocal);
  decisions.push(...decisionsData);

  return driverFound;
}

module.exports.ensureWaitingDriverRequest = ensureWaitingDriverRequest;
module.exports.handleWaitingRequest = handleWaitingRequest;
