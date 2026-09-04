const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { pool } = require("../../Middleware/Database.config");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { performJoinSelect } = require("./ReadData.core");

const getShipperRequestByRequestUniqueId = async (shipperRequestUniqueId) => {
  const result = await performJoinSelect({
    baseTable: "ShipperRequest",
    joins: [
      {
        table: "Users",
        on: "ShipperRequest.userUniqueId = Users.userUniqueId",
      },
    ],

    conditions: { shipperRequestUniqueId },
  });

  if (!result?.length) {
    throw new AppError("Request not found", AppError.NOT_FOUND);
  }
  return result[0];
};

const checkActiveShipperRequest = async ({
  userUniqueId,
  page = 1,
  pageSize = 10,
  connection = null,
  queueOrganizationUniqueId = null,
}) => {
  const offset = (page - 1) * pageSize;
  // Active pipeline: waiting → requested → acceptedByDriver → acceptedByShipper
  // → loading stages (5/6/7) → journeyStarted (8). The loading stages were
  // inserted between 4 and 8, so they must be part of the active fetch.
  const activeJourneyStatuses = [
    journeyStatusMap.waiting, //1
    journeyStatusMap.requested, //2
    journeyStatusMap.acceptedByDriver, //3
    journeyStatusMap.acceptedByShipper, //4
    journeyStatusMap.goToLoadingPlace, //5
    journeyStatusMap.loading, //6
    journeyStatusMap.loaded, //7
    journeyStatusMap.journeyStarted, //8
  ];

  const query = `
    SELECT 
        sr.shipperRequestId,
        sr.shipperRequestUniqueId,
        sr.userUniqueId,
        sr.shipperRequestBatchUniqueId,
        sr.vehicleTypeUniqueId,
        sr.journeyStatusId,
        sr.originLatitude,
        sr.originLongitude,
        sr.originPlace,
        sr.destinationLatitude,
        sr.destinationLongitude,
        sr.destinationPlace,
        sr.shipperRequestCreatedAt,
        sr.shippableItemName,
        sr.shippableItemQtyInQuintal,
        sr.shippingDate,
        sr.deliveryDate,
        sr.shippingCost,
        sr.requestMode,
        u.fullName,
        u.phoneNumber,
        u.email,
        -- Priority calculation
        CASE 
          WHEN sr.journeyStatusId = ? THEN 1 -- acceptedByDriver (highest)
          WHEN (sr.isCompletionSeen = ? AND sr.journeyStatusId = ?) THEN 2 -- not seen completed
          WHEN (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ?) THEN 2 -- not seen cancelled by driver
          ELSE 3 -- other statuses
        END as priority
    FROM ShipperRequest sr
    INNER JOIN Users u ON sr.userUniqueId = u.userUniqueId
    LEFT JOIN JourneyDecisions jd ON sr.shipperRequestId = jd.shipperRequestId
    -- queueOrganizationUniqueId is canonical on the batch (srb), inherited via join
    LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
    WHERE ${queueOrganizationUniqueId ? "srb.queueOrganizationUniqueId = ?" : "sr.userUniqueId = ?"}
    AND (
      sr.journeyStatusId IN (?,?,?,?,?,?,?,?) 
      OR (sr.isCompletionSeen = ? AND sr.journeyStatusId = ?)
      OR (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ?)
    )
    ORDER BY 
      priority ASC, -- Priority first
      sr.shipperRequestId DESC -- Then by latest
    LIMIT ? OFFSET ?
  `;

  const values = [
    journeyStatusMap?.acceptedByDriver, // for CASE
    false, // for CASE
    journeyStatusMap?.journeyCompleted, // for CASE
    journeyStatusMap?.cancelledByDriver, // for CASE
    "not seen by shipper yet", // for CASE
    queueOrganizationUniqueId || userUniqueId,
    ...activeJourneyStatuses,
    false,
    journeyStatusMap?.journeyCompleted,
    journeyStatusMap?.cancelledByDriver,
    "not seen by shipper yet",
    Number(pageSize),
    Number(offset),
  ];

  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [activeRequests, totalRecords] = await Promise.all([
    queryExecutor?.query?.(query, values),
    getActiveRequestsCount(userUniqueId, connection, queueOrganizationUniqueId),
  ]);

  return { activeRequests: activeRequests?.[0], totalRecords };
};

const getActiveRequestsCount = async (
  userUniqueId,
  connection = null,
  queueOrganizationUniqueId = null,
) => {
  // ── Part 1: Individual-level counts from ShipperRequest ────────────────
  // Only count INDIVIDUAL (non-company_target) requests here.
  // Company counts come entirely from the ShipperRequestBatch query (Part 2).
  const prQuery = `
    SELECT 
      COUNT(DISTINCT sr.shipperRequestId) as totalCount,
      COUNT(DISTINCT CASE WHEN sr.journeyStatusId IN (?, ?) THEN sr.shipperRequestId END) as waitingCount,
      COUNT(DISTINCT CASE WHEN sr.journeyStatusId = ? THEN sr.shipperRequestId END) as requestedCount,
      COUNT(DISTINCT CASE WHEN sr.journeyStatusId = ? THEN sr.shipperRequestId END) as biddingCount,
      COUNT(DISTINCT CASE WHEN sr.journeyStatusId IN (?, ?, ?, ?) THEN sr.shipperRequestId END) as acceptedByShipperCount,
      COUNT(DISTINCT CASE WHEN sr.journeyStatusId = ? THEN sr.shipperRequestId END) as journeyStartedCount,
      COUNT(DISTINCT CASE WHEN sr.journeyStatusId = ? AND sr.isCompletionSeen = ? THEN sr.shipperRequestId END) as notSeenCompletedCount,
      COUNT(DISTINCT CASE WHEN jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ? THEN sr.shipperRequestId END) as notSeenCancelledByDriverCount
    FROM ShipperRequest sr
    LEFT JOIN JourneyDecisions jd ON sr.shipperRequestId = jd.shipperRequestId
    -- queueOrganizationUniqueId is canonical on the batch (srb), inherited via join
    LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId = sr.shipperRequestBatchUniqueId
    WHERE ${queueOrganizationUniqueId ? "srb.queueOrganizationUniqueId = ?" : "sr.userUniqueId = ?"}
    AND sr.shipperRequestDeletedAt IS NULL
    AND (sr.requestMode IS NULL OR sr.requestMode != 'company_target')
    AND (
      sr.journeyStatusId IN (?,?,?,?,?,?,?,?)
      OR (sr.isCompletionSeen = ? AND sr.journeyStatusId = ?)
      OR (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ?)
    )
  `;

  const prValues = [
    // waitingCount
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    // requestedCount, biddingCount, acceptedByShipperCount (4/5/6/7), journeyStartedCount
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    journeyStatusMap.acceptedByShipper,
    journeyStatusMap.goToLoadingPlace,
    journeyStatusMap.loading,
    journeyStatusMap.loaded,
    journeyStatusMap.journeyStarted,
    // notSeenCompletedCount
    journeyStatusMap.journeyCompleted,
    false,
    // notSeenCancelledByDriverCount
    journeyStatusMap.cancelledByDriver,
    "not seen by shipper yet",
    // WHERE clause
    queueOrganizationUniqueId || userUniqueId,
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    journeyStatusMap.acceptedByShipper,
    journeyStatusMap.goToLoadingPlace,
    journeyStatusMap.loading,
    journeyStatusMap.loaded,
    journeyStatusMap.journeyStarted,
    false,
    journeyStatusMap.journeyCompleted,
    journeyStatusMap.cancelledByDriver,
    "not seen by shipper yet",
  ];

  // ── Part 2: Company batch counts from ShipperRequestBatch ─────────────
  // For company_target orders, ShipperRequest rows don't exist until a bid
  // is accepted.  Waiting/auction counts must come from the batch table.
  const batchQuery = `
    SELECT
      COUNT(DISTINCT CASE
        WHEN b.journeyStatusId IN (?, ?)
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchUniqueId = b.batchUniqueId
              AND cbr.bidStatus IN ('accepted_by_shipper', 'submitted')
          )
        THEN b.batchUniqueId
      END) as companyBatchWaitingCount,

      COALESCE(SUM(CASE
        WHEN b.journeyStatusId IN (?, ?)
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchUniqueId = b.batchUniqueId
              AND cbr.bidStatus IN ('accepted_by_shipper', 'submitted')
          )
        THEN b.totalVehicles
        ELSE 0
      END), 0) as companyBatchWaitingVehicles,

      COUNT(DISTINCT CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchUniqueId = b.batchUniqueId
              AND cbr.bidStatus = 'submitted'
          )
        THEN b.batchUniqueId
      END) as companyAuctionCount,

      -- companyAuctionVehicles: total vehicles in batches receiving bids (bidStatus=submitted)
      COALESCE(SUM(CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchUniqueId = b.batchUniqueId
              AND cbr.bidStatus = 'submitted'
          )
        THEN b.totalVehicles
        ELSE 0
      END), 0) as companyAuctionVehicles,

      COUNT(DISTINCT CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchUniqueId = b.batchUniqueId
              AND cbr.bidStatus = 'accepted_by_shipper'
          )
          AND b.journeyStatusId = ?
        THEN b.batchUniqueId
      END) as companyOngoingCount,

      COALESCE(SUM(CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchUniqueId = b.batchUniqueId
              AND cbr.bidStatus = 'accepted_by_shipper'
          )
          AND b.journeyStatusId = ?
        THEN b.totalVehicles
        ELSE 0
      END), 0) as companyOngoingVehicles

    FROM ShipperRequestBatch b
    WHERE b.shipperUserUniqueId = ?
      AND b.batchDeletedAt IS NULL
      AND b.requestMode = 'company_target'
  `;

  const batchValues = [
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByShipper,
    journeyStatusMap.acceptedByShipper,
    userUniqueId,
  ];

  // ── Part 3: Company slot-level counts (flat — backward compat) ──────────
  // Counts journeyStarted / notSeenCompleted / notSeenCancelledByDriver for
  // company slots. Kept as-is; old consumers read these top-level keys.
  const companySlotQuery = `
    SELECT
      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId = ?
        THEN sr.shipperRequestId END) AS companyJourneyStarted,

      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId = ? AND sr.isCompletionSeen = ?
        THEN sr.shipperRequestId END) AS companyNotSeenCompleted,

      COUNT(DISTINCT CASE
        WHEN jd.journeyStatusId = ?
          AND jd.isCancellationByDriverSeenByShipper = ?
        THEN sr.shipperRequestId END) AS companyNotSeenCancelledByDriver

    FROM ShipperRequest sr
    LEFT JOIN JourneyDecisions jd ON jd.shipperRequestId = sr.shipperRequestId
    WHERE sr.userUniqueId = ?
      AND sr.requestMode = 'company_target'
      AND sr.shipperRequestDeletedAt IS NULL
  `;

  const companySlotValues = [
    journeyStatusMap.journeyStarted, // companyJourneyStarted
    journeyStatusMap.journeyCompleted, // companyNotSeenCompleted status
    false, // companyNotSeenCompleted isCompletionSeen
    journeyStatusMap.cancelledByDriver, // companyNotSeenCancelledByDriver status
    "not seen by shipper yet", // companyNotSeenCancelledByDriver seen flag
    userUniqueId,
  ];

  // ── Part 4: Active-only company slot breakdown (nested under acceptedByShipper) ──
  //
  // PURPOSE
  // -------
  // This breakdown is used exclusively for live badge/status indicators on the
  // shipper dashboard.  It answers: "how many vehicle slots need my attention
  // right now?"  Only statuses that represent work-in-progress are included.
  //
  // INCLUDED (active pipeline — shows in dashboard badges)
  // -------------------------------------------------------
  //   notAssigned      — slot is free, never had a driver;  company must assign one
  //   needsReassignment— slot is free again; previous driver cancelled; reassign needed
  //   assigned         — driver notified, waiting for driver to confirm
  //   driverConfirmed  — driver confirmed / heading to loading point
  //   journeyStarted   — goods loaded, driver in transit
  //   completed        — delivered but NOT YET SEEN by shipper (unseen badge)
  //                      → drops to 0 once shipper opens the record
  //
  // EXCLUDED (dead / terminal — intentionally omitted from this response)
  // -----------------------------------------------------------------------
  //   cancelledByShipper — terminal; shipper already acted, no further action needed
  //                        (commented out — restore when a "cancelled history" view is built)
  //   seen completions   — isCompletionSeen = true; shipper already acknowledged;
  //                        no badge needed
  //   total              — gross slot count includes all statuses above (active + dead);
  //                        misleading in an active-only context; commented out.
  //                        If you need a denominator, query it separately.
  //
  // TO RESTORE excluded fields: un-comment the matching SQL CASE, binding value,
  // and response field.  All three are labelled "commented out — restore later".
  const companyBreakdownQuery = `
    SELECT
      -- notAssigned: free slot, never had a driver at all
      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId = ?
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba
            WHERE cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
              AND cba.assignmentDeletedAt IS NULL
              AND cba.assignmentStatus NOT IN (
                'rejected_by_driver','cancelled_by_company',
                'cancelled_by_shipper','cancelled_by_driver'
              )
          )
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba2
            WHERE cba2.shipperRequestUniqueId = sr.shipperRequestUniqueId
              AND cba2.assignmentDeletedAt IS NULL
              AND cba2.assignmentStatus = 'cancelled_by_driver'
          )
        THEN sr.shipperRequestId END) AS notAssigned,

      -- needsReassignment: driver cancelled, slot is free again
      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId = ?
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba
            WHERE cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
              AND cba.assignmentDeletedAt IS NULL
              AND cba.assignmentStatus NOT IN (
                'rejected_by_driver','cancelled_by_company',
                'cancelled_by_shipper','cancelled_by_driver'
              )
          )
          AND EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba2
            WHERE cba2.shipperRequestUniqueId = sr.shipperRequestUniqueId
              AND cba2.assignmentDeletedAt IS NULL
              AND cba2.assignmentStatus = 'cancelled_by_driver'
          )
        THEN sr.shipperRequestId END) AS needsReassignment,

      -- assigned: driver notified, waiting for driver to confirm
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM CompanyBidVehicleAssignment cba
          WHERE cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
            AND cba.assignmentDeletedAt IS NULL
            AND cba.assignmentStatus = 'assigned'
        )
        THEN sr.shipperRequestId END) AS assigned,

      -- driverConfirmed: driver confirmed or heading to loading point
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM CompanyBidVehicleAssignment cba
          WHERE cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
            AND cba.assignmentDeletedAt IS NULL
            AND cba.assignmentStatus IN ('confirmed_by_driver','going_to_loading')
        )
        THEN sr.shipperRequestId END) AS driverConfirmed,

      -- journeyStarted: goods loaded, driver in transit
      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId = ?
        THEN sr.shipperRequestId END) AS journeyStarted,

      -- completed: delivered but NOT YET SEEN by the shipper
      -- Once the shipper opens it and marks it seen, this drops to 0.
      -- Mirrors the same filter used in notSeenCompleted (Part 3).
      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId = ?
          AND sr.isCompletionSeen = false
        THEN sr.shipperRequestId END) AS completed,

      /* -- cancelledByShipper: commented out — will restore later
      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId = ?
        THEN sr.shipperRequestId END) AS cancelledByShipper,
      */

      -- total: active slots only — excludes cancelled (by anyone) and seen-completed.
      -- This is the clean denominator for the active dashboard view:
      --   total = notAssigned + needsReassignment + assigned + driverConfirmed
      --         + journeyStarted + completed(unseen)
      COUNT(DISTINCT CASE
        WHEN sr.journeyStatusId NOT IN (?, ?, ?, ?)   -- skip all cancel terminals
          AND NOT (sr.journeyStatusId = ? AND sr.isCompletionSeen = true) -- skip seen-completed
        THEN sr.shipperRequestId END) AS total

    FROM ShipperRequest sr
    WHERE sr.userUniqueId = ?
      AND sr.requestMode = 'company_target'
      AND sr.shipperRequestDeletedAt IS NULL
  `;

  const companyBreakdownValues = [
    journeyStatusMap.acceptedByShipper, // notAssigned: status check 1
    journeyStatusMap.acceptedByShipper, // needsReassignment: status check 2
    journeyStatusMap.journeyStarted, // journeyStarted
    journeyStatusMap.journeyCompleted, // completed (unseen only)
    // journeyStatusMap.cancelledByShipper, // cancelledByShipper — commented out
    // total: 4 cancel terminals + journeyCompleted for seen-completed exclusion
    journeyStatusMap.cancelledByShipper, // total: exclude cancelledByShipper
    journeyStatusMap.cancelledByDriver, // total: exclude cancelledByDriver
    journeyStatusMap.cancelledByAdmin, // total: exclude cancelledByAdmin
    journeyStatusMap.cancelledBySystem, // total: exclude cancelledBySystem
    journeyStatusMap.journeyCompleted, // total: exclude seen-completed (paired with isCompletionSeen=true)
    userUniqueId,
  ];

  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [prResult, batchResult, companySlotResult, companyBreakdownResult] =
    await Promise.all([
      queryExecutor.query(prQuery, prValues),
      queryExecutor.query(batchQuery, batchValues),
      queryExecutor.query(companySlotQuery, companySlotValues),
      queryExecutor.query(companyBreakdownQuery, companyBreakdownValues),
    ]);

  const sr = prResult[0][0];
  const batch = batchResult[0][0];
  const companySlot = companySlotResult[0][0];
  const bd = companyBreakdownResult[0][0]; // breakdown

  const n = (v) => Number(v) || 0;

  const companyWaiting = n(batch.companyBatchWaitingVehicles); // SUM(totalVehicles) ✅
  const companyBidding = n(batch.companyAuctionVehicles); // SUM(totalVehicles) ✅ (was batch count)
  const companyActive = n(batch.companyOngoingVehicles); // SUM(totalVehicles) ✅
  const companyJourneyStarted = n(companySlot.companyJourneyStarted);
  const companyNotSeenCompleted = n(companySlot.companyNotSeenCompleted);
  const companyNotSeenCancelled = n(
    companySlot.companyNotSeenCancelledByDriver,
  );

  const individualTotal = n(sr.totalCount);
  const totalCount =
    individualTotal +
    companyWaiting +
    companyBidding +
    companyActive +
    companyJourneyStarted +
    companyNotSeenCompleted +
    companyNotSeenCancelled;

  return {
    totalCount,
    waiting: { individual: n(sr.waitingCount), company: companyWaiting },
    requested: { individual: n(sr.requestedCount), company: 0 },
    bidding: {
      individual: n(sr.biddingCount),
      company: companyBidding,
    },

    // ── acceptedByShipper: individual stays a plain number;
    //    company is a full pipeline breakdown of all slots under the won bid.
    //    Old consumers that read company as a number will get an object now
    //    (intentional — kept for migration period alongside old flat keys below).
    acceptedByShipper: {
      individual: n(sr.acceptedByShipperCount),
      company: {
        notAssigned: n(bd.notAssigned), // free slot (vehicle), never touched
        needsReassignment: n(bd.needsReassignment), // vehicle lost driver, needs new assign
        assigned: n(bd.assigned), // vehicle: driver notified, awaiting confirm
        driverConfirmed: n(bd.driverConfirmed), // vehicle: driver confirmed / loading
        journeyStarted: n(bd.journeyStarted), // vehicle: goods loaded, in transit
        completed: n(bd.completed), // vehicle: delivered
        // cancelledByShipper:n(bd.cancelledByShipper), // commented out — restore for history view
        // ongoingVehicles: total vehicles across accepted batches (vehicle unit, from Part 2)
        ongoingVehicles: n(batch.companyOngoingVehicles),
        // batchCount: distinct accepted batches — used for frontend Ongoing list badge
        batchCount: n(batch.companyOngoingCount),
        // active-only total: excludes cancelled (all types) + seen-completed
        // = notAssigned + needsReassignment + assigned + driverConfirmed + journeyStarted + completed(unseen)
        total: n(bd.total),
      },
    },

    // ── Flat keys kept for backward compatibility — will be removed later ──
    journeyStarted: {
      individual: n(sr.journeyStartedCount),
      company: companyJourneyStarted,
    },
    notSeenCompleted: {
      individual: n(sr.notSeenCompletedCount),
      company: companyNotSeenCompleted,
    },
    notSeenCancelledByDriver: {
      individual: n(sr.notSeenCancelledByDriverCount),
      company: companyNotSeenCancelled,
    },
  };
};

module.exports = {
  getShipperRequestByRequestUniqueId,
  checkActiveShipperRequest,
  getActiveRequestsCount,
};
