"use strict";

const { pool } = require("../../../Middleware/Database.config");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
  supportingDecisionStatuses,
  inactiveJourneyStatuses,
  isActiveJourneyStatus,
} = require("../../../Utils/ListOfSeedData");
const logger = require("../../../Utils/logger");
const { transactionStorage } = require("../../../Utils/TransactionContext");
const { executeInTransaction } = require("../../../Utils/DatabaseTransaction");
const {
  repairMissingJourneyByDecision,
} = require("../../Journey/journeyRepair.service");

/**
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Status handling (read-only): if a live sr has no matching decisions (all
 * drivers cancelled/rejected) it is projected as status 1 (waiting) and rendered
 * through the inactive bucket. A terminal status (cancelled, completed, ...) is
 * never corrected — it is returned as stored. Nothing here writes to the
 * database; the scheduled reconciler persists any correction.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */

/**
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Status handling (read-only): if a live sr has no matching decisions (all
 * drivers cancelled/rejected) it is projected as status 1 (waiting) and rendered
 * through the inactive bucket. A terminal status (cancelled, completed, ...) is
 * never corrected — it is returned as stored. Nothing here writes to the
 * database; the scheduled reconciler persists any correction.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */

/**
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Status handling (read-only): if a live sr has no matching decisions (all
 * drivers cancelled/rejected) it is projected as status 1 (waiting) and rendered
 * through the inactive bucket. A terminal status (cancelled, completed, ...) is
 * never corrected — it is returned as stored. Nothing here writes to the
 * database; the scheduled reconciler persists any correction.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */

/**
 * Enriches shipper requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - sr  = ShipperRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a sr ↔ DR with a status: accepted, cancelled, etc.)
 *  - VD  = VehicleDriver (links a driver user to a vehicle)
 *  - VT  = VehicleTypes (vehicle category: Isuzu FSR, Sino truck, etc.)
 *
 * Performance: Uses 5 batched queries instead of per-request loops (N+1 → O(1)):
 *  1. All JourneyDecisions for all PRs (filtered by matching journeyStatusId)
 *  2. All DriverRequests + Users (JOIN)
 *  3. All Vehicles + VehicleDriver + VehicleTypes (JOIN)
 *  4. All driver profile photos (AttachedDocuments)
 *  5. Journey data (only for started/completed statuses)
 *
 * Status handling (read-only): if a live sr has no matching decisions (all
 * drivers cancelled/rejected) it is projected as status 1 (waiting) and rendered
 * through the inactive bucket. A terminal status (cancelled, completed, ...) is
 * never corrected — it is returned as stored. Nothing here writes to the
 * database; the scheduled reconciler persists any correction.
 *
 * @param {Array<Object>} shipperRequests - Array of sr rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - shipperRequest: the original sr row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */
const getDetailedJourneyData = async (shipperRequests) => {
  return await executeInTransaction(async () => {
    const executor = transactionStorage.getStore() || pool;
    if (!shipperRequests || shipperRequests.length === 0) {
      return [];
    }
    const waitingResults = [];
    const waitingSRs = [];
    const activeSRs = [];

    // --- Step 1: Pre-filter non-active PRs (no DB hit) ---
    // Everything in `inactiveJourneyStatuses` (waiting + terminal outcomes such as
    // cancelledByAdmin) is rendered through the inactive bucket below, so it never
    // reaches the active-status reconciliation path.
    for (const sr of shipperRequests) {
      if (inactiveJourneyStatuses.includes(Number(sr.journeyStatusId))) {
        waitingSRs.push(sr);
        waitingResults.push({
          shipperRequest: sr,
          driverRequests: [],
          decisions: [],
          journey: {},
        });
      } else {
        activeSRs.push(sr);
      }
    }

    // --- Step 2: Batch fetch all active/positive decisions for active and
    // waiting/cancelled PRs (1 query) — cancelled orders keep their linked
    // decisions so the shipper list can still show who was involved ---
    const srIds = [...activeSRs, ...waitingSRs].map(
      (sr) => sr.shipperRequestId,
    );
    // Loading stages (5/6/7) are active decisions too — without them a request
    // mid-loading would look decision-less and get auto-corrected to waiting.
    const positiveStatuses = supportingDecisionStatuses;
    const [allDecisionsRaw] = await executor.query(
      `SELECT * FROM JourneyDecisions WHERE shipperRequestId IN (?) AND journeyStatusId IN (?)`,
      [srIds, positiveStatuses],
    );
    // Group decisions by shipperRequestId
    const decisionsBySR = new Map();
    for (const d of allDecisionsRaw) {
      // if decisionsBySR dont have the shipperRequestId as key, add it with an empty array
      if (!decisionsBySR.has(d.shipperRequestId)) {
        decisionsBySR.set(d.shipperRequestId, []);
      }
      // push the decision to the array of the shipperRequestId
      decisionsBySR.get(d.shipperRequestId).push(d);
    }

    // --- Step 3: Resolve status mismatches (read-only) ---
    // This function used to PERSIST its corrections here, which made every GET
    // mutate the database. That silently rewrote admin-cancelled orders back to
    // `waiting` (they carry no positive decision, so they looked "stale") and
    // resurrected them onto the offerable board. Persistence now belongs to the
    // scheduled reconciler (Services/ShipperRequest/reconcileStatus.service.js);
    // here the corrected status is only projected onto the response.
    const projectedSRs = []; // PRs rendered as `waiting` despite a stale status
    const validSRs = []; // PRs with matching decisions
    const allDecisions = []; // Decisions matching current/projected status

    for (const sr of activeSRs) {
      const decisions = decisionsBySR.get(sr.shipneyRequestId) || [];
      if (decisions.length === 0) {
        // No matching active decisions. `acceptedByShipper` (4) is a valid
        // intentional state in the company-target flow: the batch was accepted
        // but no driver assignment exists yet.
        const isIntentionalStatus =
          sr.journeyStatusId === journeyStatusMap.waiting ||
          sr.journeyStatusId === journeyStatusMap.acceptedByShipper;
        // Guard: only a request that is still live may be corrected. A terminal
        // status (cancelled, completed, rejected, ...) has no supporting decision
        // by definition and must be left exactly as it is.
        if (isIntentionalStatus || !isActiveJourneyStatus(sr.journeyStatusId)) {
          validSRs.push(sr);
        } else {
          logger.warn("@getDetailedJourneyData: stale active sr, projecting waiting", {
            shipperRequestId: sr.shipperRequestId,
            staleStatus: sr.journeyStatusId,
          });
          sr.journeyStatusId = journeyStatusMap.waiting; // Project only, no write
          projectedSRs.push(sr);
        }
      } else {
        // Check if sr status needs advancement (status mismatch where decisions are ahead)
        const maxDecisionStatus = Math.max(
          ...decisions.map((d) => d.journeyStatusId),
        );
        if (maxDecisionStatus > sr.journeyStatusId) {
          logger.warn("@getDetailedJourneyData: projecting advanced sr status", {
            shipperRequestId: sr.shipperRequestId,
            oldStatus: sr.journeyStatusId,
            newStatus: maxDecisionStatus,
          });
          sr.journeyStatusId = maxDecisionStatus; // Project only, no write
        }

        // Collect decisions matching the final status
        const finalMatches = decisions.filter(
          (d) => d.journeyStatusId === sr.journeyStatusId,
        );
        if (finalMatches.length > 0) {
          allDecisions.push(...finalMatches);
          validSRs.push(sr);
        } else if (isActiveJourneyStatus(sr.journeyStatusId)) {
          // If no decisions match even after projection, it's stale.
          logger.warn("@getDetailedJourneyData: unmatched active sr, projecting waiting", {
            shipperRequestId: sr.shipperRequestId,
            staleStatus: sr.journeyStatusId,
          });
          sr.journeyStatusId = journeyStatusMap.waiting;
          projectedSRs.push(sr);
        } else {
          validSRs.push(sr);
        }
      }
    }

    // Rendered through the inactive bucket so they come back as `waiting`
    // (with their linked drivers/decisions) instead of vanishing from this
    // response while the reconciler catches up.
    for (const sr of projectedSRs) {
      waitingResults.push({
        shipperRequest: sr,
        driverRequests: [],
        decisions: [],
        journey: {},
      });
    }

    // Drivers for active + waiting/cancelled PRs share one map. Waiting/
    // cancelled drivers are fetched first (no early return when no active PRs),
    // then Step 4 appends active drivers; Steps 5-6 derive vehicle/photo lookups
    // from this map so both buckets get fully enriched.
    const driversByRequestId = new Map();
    const waitingDriverRequestIds = [
      ...new Set(
        waitingSRs.flatMap((sr) =>
          (decisionsBySR.get(sr.shipperRequestId) || []).map(
            (d) => d.driverRequestId,
          ),
        ),
      ),
    ];
    if (waitingDriverRequestIds.length > 0) {
      const [waitingDrivers] = await executor.query(
        `SELECT DR.*, U.userId, U.fullName, U.phoneNumber, U.email,
                U.userCreatedAt, U.userCreatedBy, U.userDeletedAt, U.userDeletedBy,
                U.isDeleted
         FROM DriverRequest DR
         JOIN Users U ON DR.userUniqueId = U.userUniqueId
         WHERE DR.driverRequestId IN (?)`,
        [waitingDriverRequestIds],
      );
      for (const dr of waitingDrivers) {
        driversByRequestId.set(dr.driverRequestId, dr);
      }
    }

    // --- Step 4: Batch fetch all driver requests + user info (1 query) ---
    const allDriverRequestIds = allDecisions.map((d) => d.driverRequestId);
    const uniqueDriverRequestIds = [...new Set(allDriverRequestIds)];
    if (uniqueDriverRequestIds.length > 0) {
      const [allDrivers] = await executor.query(
        `SELECT DR.*, U.userId, U.fullName, U.phoneNumber, U.email,
                U.userCreatedAt, U.userCreatedBy, U.userDeletedAt, U.userDeletedBy,
                U.isDeleted
         FROM DriverRequest DR
         JOIN Users U ON DR.userUniqueId = U.userUniqueId
         WHERE DR.driverRequestId IN (?)`,
        [uniqueDriverRequestIds],
      );
      for (const dr of allDrivers) {
        driversByRequestId.set(dr.driverRequestId, dr);
      }
    }

    // --- Step 5: Batch fetch all vehicles (1 query) ---
    const allDriverUserIds = [
      ...new Set([...driversByRequestId.values()].map((dr) => dr.userUniqueId)),
    ];
    let vehiclesByDriver = new Map();
    if (allDriverUserIds.length > 0) {
      const [allVehicles] = await executor.query(
        `SELECT V.*, VD.vehicleDriverId, VD.vehicleDriverUniqueId,
                VD.driverUserUniqueId, VD.assignmentStatus, VD.assignmentStartDate,
                VD.assignmentEndDate, VD.vehicleDriverCreatedBy, VD.vehicleDriverUpdatedBy,
                VD.vehicleDriverDeletedBy, VD.vehicleDriverCreatedAt, VD.vehicleDriverUpdatedAt,
                VD.vehicleDriverDeletedAt,
                VT.vehicleTypeId, VT.vehicleTypeName, VT.vehicleTypeIconName,
                VT.vehicleTypeDescription, VT.vehicleTypeCreatedBy, VT.vehicleTypeUpdatedBy,
                VT.vehicleTypeDeletedBy, VT.carryingCapacity, VT.vehicleTypeUpdatedAt,
                VT.vehicleTypeCreatedAt, VT.vehicleTypeDeletedAt
         FROM Vehicle V
         JOIN VehicleDriver VD ON V.vehicleUniqueId = VD.vehicleUniqueId
         JOIN VehicleTypes VT ON V.vehicleTypeUniqueId = VT.vehicleTypeUniqueId
         WHERE VD.driverUserUniqueId IN (?) AND VD.assignmentStatus = 'active'`,
        [allDriverUserIds],
      );
      for (const v of allVehicles) {
        vehiclesByDriver.set(v.driverUserUniqueId, v);
      }
    }

    // --- Step 6: Batch fetch all profile photos (1 query) ---
    let photosByDriver = new Map();
    if (allDriverUserIds.length > 0) {
      const [allPhotos] = await executor.query(
        `SELECT attachedDocumentCreatedByUserId, attachedDocumentName
         FROM AttachedDocuments
         WHERE attachedDocumentCreatedByUserId IN (?)
           AND documentTypeId = ?
         ORDER BY attachedDocumentId DESC`,
        [allDriverUserIds, listOfDocumentsTypeAndId.profilePhoto],
      );

      // Take the latest photo per driver (first result due to DESC order)
      for (const photo of allPhotos) {
        if (!photosByDriver.has(photo.attachedDocumentCreatedByUserId)) {
          photosByDriver.set(
            photo.attachedDocumentCreatedByUserId,
            photo.attachedDocumentName,
          );
        }
      }
    }

    // --- Step 7: Batch fetch journey data if needed (1 query) ---
    // Loading stages (5/6/7) record GPS + proof on the Journey row, so the
    // shipper list must carry it too (map/blue-line + proof display).
    const journeyStatuses = [
      journeyStatusMap.goToLoadingPlace,
      journeyStatusMap.loading,
      journeyStatusMap.loaded,
      journeyStatusMap.journeyStarted,
      journeyStatusMap.journeyCompleted,
    ];
    const srsNeedingJourney = validSRs.filter((sr) =>
      journeyStatuses.includes(sr.journeyStatusId),
    );
    // console.log("@srsNeedingJourney", srsNeedingJourney);
    let journeyByDecisionUniqueId = new Map();
    if (srsNeedingJourney.length > 0) {
      // Collect ALL decision unique IDs for PRs needing journey data — not just decisions[0],
      // because a sr may have multiple decisions (e.g. one rejected, one accepted/completed).
      // We search across all of them so the correct journey record is always found.
      const journeyDecisionUniqueIds = srsNeedingJourney.flatMap((sr) => {
        const decisions = decisionsBySR.get(sr.shipperRequestId) || [];
        return decisions.map((d) => d.journeyDecisionUniqueId).filter(Boolean);
      });
      const uniqueJourneyDecisionIds = [...new Set(journeyDecisionUniqueIds)];
      if (uniqueJourneyDecisionIds.length > 0) {
        const [allJourneys] = await executor.query(
          `SELECT * FROM Journey WHERE journeyDecisionUniqueId IN (?)`,
          [uniqueJourneyDecisionIds],
        );
        for (const j of allJourneys) {
          journeyByDecisionUniqueId.set(j.journeyDecisionUniqueId, j);
        }

        // Self-heal: a completed decision can lose its Journey row (the
        // 2026-08-27 schema rebuild wiped pre-existing rows). Without it the
        // shipper's completed screen shows `journey: {}` and the POD submit
        // cannot resolve a journeyUniqueId. Reconstruct missing rows for the
        // completed decisions in this batch via the existing createJourney
        // service (idempotent — skipped when the row exists).
        const repairedJourneys = [];
        for (const sr of srsNeedingJourney) {
          const decisions = decisionsBySR.get(sr.shipperRequestId) || [];
          for (const d of decisions) {
            if (!d?.journeyDecisionUniqueId) continue;
            if (journeyByDecisionUniqueId.has(d.journeyDecisionUniqueId)) continue;
            const result = await repairMissingJourneyByDecision(
              d.journeyDecisionUniqueId,
              executor,
            );
            if (result.repaired && result.journey?.journeyDecisionUniqueId) {
              journeyByDecisionUniqueId.set(
                result.journey.journeyDecisionUniqueId,
                result.journey,
              );
              repairedJourneys.push(result.journey);
            }
          }
        }
        if (repairedJourneys.length > 0) {
          const logger = require("../../../Utils/logger");
          logger.info("Auto-repaired missing Journey rows for completed decisions", {
            count: repairedJourneys.length,
          });
        }
      }
    }

    // --- Step 7.5: Batch fetch proof of delivery for completed journeys ---
    const completedSRs = validSRs.filter(
      (sr) => sr.journeyStatusId === journeyStatusMap.journeyCompleted,
    );
    const podByJourneyUniqueId = new Map();
    if (completedSRs.length > 0) {
      const completedJourneyUniqueIds = completedSRs
        .map((sr) => {
          const jd =
            decisionsBySR.get(sr.shipperRequestId)?.find(
              (d) => d.journeyStatusId === sr.journeyStatusId,
            ) ||
            decisionsBySR.get(sr.shipperRequestId)?.[0];
          const j = journeyByDecisionUniqueId.get(jd?.journeyDecisionUniqueId);
          return j?.journeyUniqueId;
        })
        .filter(Boolean);

      if (completedJourneyUniqueIds.length > 0) {
        const [allDCs] = await executor.query(
          `SELECT dc.*,
                  u.fullName AS receiverFullName,
                  u.phoneNumber AS receiverPhoneNumber
           FROM DeliveryConfirmations dc
           LEFT JOIN Users u ON u.userUniqueId = dc.receiverUserUniqueId
           WHERE dc.journeyUniqueId IN (?)
             AND dc.deliveryConfirmationDeletedAt IS NULL`,
          [completedJourneyUniqueIds],
        );

        const dcUniqueIds = allDCs.map((dc) => dc.deliveryConfirmationUniqueId);
        const photosByDC = new Map();
        if (dcUniqueIds.length > 0) {
          const [allPhotos] = await executor.query(
            `SELECT deliveryConfirmationUniqueId, deliveryConfirmationPhotoUrl
             FROM DeliveryConfirmationPhotos
             WHERE deliveryConfirmationUniqueId IN (?)
               AND deliveryConfirmationPhotoDeletedAt IS NULL
             ORDER BY deliveryConfirmationPhotoId ASC`,
            [dcUniqueIds],
          );
          for (const p of allPhotos) {
            if (!photosByDC.has(p.deliveryConfirmationUniqueId)) {
              photosByDC.set(p.deliveryConfirmationUniqueId, []);
            }
            photosByDC.get(p.deliveryConfirmationUniqueId).push(p.deliveryConfirmationPhotoUrl);
          }
        }

        for (const dc of allDCs) {
          podByJourneyUniqueId.set(dc.journeyUniqueId, {
            deliveryConfirmationUniqueId: dc.deliveryConfirmationUniqueId,
            receiverFullName: dc.receiverFullName,
            receiverPhoneNumber: dc.receiverPhoneNumber,
            deliveredQuantity: dc.deliveryConfirmationDeliveredQuantity,
            quantityUnit: dc.deliveryConfirmationQuantityUnit,
            condition: dc.deliveryConfirmationCondition,
            deliveryConfirmationStatus: dc.deliveryConfirmationStatus,
            deliveryConfirmationSource: dc.deliveryConfirmationSource,
            photos: photosByDC.get(dc.deliveryConfirmationUniqueId) || [],
            shipperSignature: dc.deliveryConfirmationShipperSignature,
            notes: dc.deliveryConfirmationNotes,
            podSubmittedAt: dc.deliveryConfirmationConfirmedAt,
          });
        }
      }
    }

    // --- Step 7.75: Batch fetch queue org + queue entry data for queue orders ---
    // On-behalf-of shipper requests (created by a QueueOrgAdmin) belong to a
    // QueueOrganization via their ShipperRequestBatch. Attach the queue org and
    // the driver's live DriverQueue entry (offer) so clients can render the
    // queue context directly on the shipper-request list item.
    const queueOrgIds = [
      ...new Set(
        shipperRequests
          .map((sr) => sr.batchQueueOrganizationUniqueId)
          .filter(Boolean),
      ),
    ];
    let queueOrgByUniqueId = new Map();
    if (queueOrgIds.length > 0) {
      const [orgRows] = await executor.query(
        `SELECT queueOrganizationUniqueId, queueOrganizationName,
                queueOrganizationType, queueOrganizationPhone,
                queueOrganizationAddress, latitude, longitude, checkinRadiusKm,
                approvalStatus, approvalReason, queueEnabled, approvedBy, approvedAt
         FROM QueueOrganization
         WHERE queueOrganizationUniqueId IN (?) AND isDeleted = 0`,
        [queueOrgIds],
      );
      for (const o of orgRows) {
        queueOrgByUniqueId.set(o.queueOrganizationUniqueId, o);
      }
    }

    // Map each shipper request → its driver's current DriverQueue entry for that
    // order (active offer if requested, otherwise the entry holding the job).
    const orderUniqueIds = shipperRequests
      .map((sr) => sr.shipperRequestUniqueId)
      .filter(Boolean);
    let queueEntryByOrder = new Map();
    if (orderUniqueIds.length > 0) {
      const [entryRows] = await executor.query(
        `SELECT dq.queueUniqueId, dq.queueOrganizationUniqueId, dq.queueDate,
                dq.queueNumber, dq.status, dq.requestedAt, dq.agreedAt,
                dq.queueRefusalCount, dq.targetedShipperUserUUID,
                dq.shipperRequestUniqueId, vd.vehicleDriverUniqueId, u.fullName,
                u.phoneNumber
         FROM DriverQueue dq
         JOIN VehicleDriver vd ON vd.vehicleDriverUniqueId = dq.vehicleDriverUniqueId
         JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
         WHERE dq.shipperRequestUniqueId IN (?)
           AND dq.queueDeletedAt IS NULL`,
        [orderUniqueIds],
      );
      for (const e of entryRows) {
        queueEntryByOrder.set(e.shipperRequestUniqueId, e);
      }
    }

    const buildQueue = (sr) => {
      const orgUniqueId = sr.batchQueueOrganizationUniqueId;
      if (!orgUniqueId) return {};
      const organization = queueOrgByUniqueId.get(orgUniqueId) || null;
      const entry = queueEntryByOrder.get(sr.shipperRequestUniqueId) || null;
      return { organization, entry };
    };

    // Also attach queue context + linked drivers/decisions to the waiting/cancelled
    // items — cancelled orders keep the drivers that were involved (incl. the
    // system/problem-solver driver that cancelled the search).
    for (const item of waitingResults) {
      const sr = item.shipperRequest;
      if (sr?.batchQueueOrganizationUniqueId) {
        item.queue = buildQueue(sr);
      } else {
        item.queue = {};
      }
      const decisions = (decisionsBySR.get(sr.shipperRequestId) || []).filter(
        (decision) => driversByRequestId.has(decision.driverRequestId),
      );
      item.decisions = decisions;
      item.driverRequests = decisions
        .map((decision) => {
          const driver = driversByRequestId.get(decision.driverRequestId);
          return {
            ...driver,
            vehicleOfDriver: vehiclesByDriver.get(driver.userUniqueId) || null,
            driverProfilePhoto: photosByDriver.get(driver.userUniqueId) || null,
          };
        })
        .filter(Boolean);
    }

    // --- Step 8: Assemble results (pure JS, no queries) ---
    const activeResults = validSRs.map((sr) => {
      const decisions = (decisionsBySR.get(sr.shipperRequestId) || []).filter(
        (decision) => driversByRequestId.has(decision.driverRequestId),
      );
      const driverRequests = decisions
        .map((decision) => {
          const driver = driversByRequestId.get(decision.driverRequestId);
          if (!driver) {
            return null;
          }
          return {
            ...driver,
            vehicleOfDriver: vehiclesByDriver.get(driver.userUniqueId) || null,
            driverProfilePhoto: photosByDriver.get(driver.userUniqueId) || null,
          };
        })
        .filter(Boolean);
      const useJourney = journeyStatuses.includes(sr.journeyStatusId);
      let journey = {};
      if (useJourney) {
        const journeyDecision =
          decisions.find((d) => d.journeyStatusId === sr.journeyStatusId) ||
          decisions[0];
        if (journeyDecision?.journeyDecisionUniqueId) {
          journey =
            journeyByDecisionUniqueId.get(
              journeyDecision.journeyDecisionUniqueId,
            ) || {};
        }
      }
      const proofOfDelivery =
        useJourney && journey.journeyUniqueId
          ? podByJourneyUniqueId.get(journey.journeyUniqueId) || null
          : null;
      return {
        shipperRequest: sr,
        driverRequests,
        decisions,
        journey,
        proofOfDelivery,
        queue: buildQueue(sr),
      };
    });
    return [...waitingResults, ...activeResults];
  });
};

module.exports = {
  getDetailedJourneyData,
};
