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
    throw new AppError("Request not found", 404);
  }
  return result[0];
};

const checkActiveShipperRequest = async ({
  userUniqueId,
  page = 1,
  pageSize = 10,
  connection = null,
}) => {
  const offset = (page - 1) * pageSize;
  const activeJourneyStatuses = [
    journeyStatusMap.waiting, //1
    journeyStatusMap.requested, //2
    journeyStatusMap.acceptedByDriver, //3
    journeyStatusMap.acceptedByShipper, //4
    journeyStatusMap.journeyStarted, //5
  ];

  const query = `
    SELECT 
        pr.shipperRequestId,
        pr.shipperRequestUniqueId,
        pr.userUniqueId,
        pr.shipperRequestBatchId,
        pr.vehicleTypeUniqueId,
        pr.journeyStatusId,
        pr.originLatitude,
        pr.originLongitude,
        pr.originPlace,
        pr.destinationLatitude,
        pr.destinationLongitude,
        pr.destinationPlace,
        pr.shipperRequestCreatedAt,
        pr.shippableItemName,
        pr.shippableItemQtyInQuintal,
        pr.shippingDate,
        pr.deliveryDate,
        pr.shippingCost,
        pr.requestMode,
        u.fullName,
        u.phoneNumber,
        u.email,
        -- Priority calculation
        CASE 
          WHEN pr.journeyStatusId = ? THEN 1 -- acceptedByDriver (highest)
          WHEN (pr.isCompletionSeen = ? AND pr.journeyStatusId = ?) THEN 2 -- not seen completed
          WHEN (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ?) THEN 2 -- not seen cancelled by driver
          ELSE 3 -- other statuses
        END as priority
    FROM ShipperRequest pr
    INNER JOIN Users u ON pr.userUniqueId = u.userUniqueId
    LEFT JOIN JourneyDecisions jd ON pr.shipperRequestId = jd.shipperRequestId
    WHERE pr.userUniqueId = ?
    AND (
      pr.journeyStatusId IN (?,?,?,?,?) 
      OR (pr.isCompletionSeen = ? AND pr.journeyStatusId = ?)
      OR (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ?)
    )
    ORDER BY 
      priority ASC, -- Priority first
      pr.shipperRequestId DESC -- Then by latest
    LIMIT ? OFFSET ?
  `;

  const values = [
    journeyStatusMap?.acceptedByDriver, // for CASE
    false, // for CASE
    journeyStatusMap?.journeyCompleted, // for CASE
    journeyStatusMap?.cancelledByDriver, // for CASE
    "not seen by shipper yet", // for CASE
    userUniqueId,
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
    getActiveRequestsCount(userUniqueId, connection),
  ]);

  return { activeRequests: activeRequests?.[0], totalRecords };
};

const getActiveRequestsCount = async (userUniqueId, connection = null) => {
  // ── Part 1: Individual-level counts from ShipperRequest ────────────────
  // Only count INDIVIDUAL (non-company_target) requests here.
  // Company counts come entirely from the ShipperRequestBatch query (Part 2).
  const prQuery = `
    SELECT 
      COUNT(DISTINCT pr.shipperRequestId) as totalCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId IN (?, ?) THEN pr.shipperRequestId END) as waitingCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.shipperRequestId END) as requestedCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.shipperRequestId END) as acceptedByDriverCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.shipperRequestId END) as acceptedByShipperCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? THEN pr.shipperRequestId END) as journeyStartedCount,
      COUNT(DISTINCT CASE WHEN pr.journeyStatusId = ? AND pr.isCompletionSeen = ? THEN pr.shipperRequestId END) as notSeenCompletedCount,
      COUNT(DISTINCT CASE WHEN jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ? THEN pr.shipperRequestId END) as notSeenCancelledByDriverCount
    FROM ShipperRequest pr
    LEFT JOIN JourneyDecisions jd ON pr.shipperRequestId = jd.shipperRequestId
    WHERE pr.userUniqueId = ?
    AND pr.shipperRequestDeletedAt IS NULL
    AND (pr.requestMode IS NULL OR pr.requestMode != 'company_target')
    AND (
      pr.journeyStatusId IN (?,?,?,?,?)
      OR (pr.isCompletionSeen = ? AND pr.journeyStatusId = ?)
      OR (jd.journeyStatusId = ? AND jd.isCancellationByDriverSeenByShipper = ?)
    )
  `;

  const prValues = [
    // waitingCount
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    // requestedCount, acceptedByDriverCount, acceptedByShipperCount, journeyStartedCount
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    journeyStatusMap.acceptedByShipper,
    journeyStatusMap.journeyStarted,
    // notSeenCompletedCount
    journeyStatusMap.journeyCompleted,
    false,
    // notSeenCancelledByDriverCount
    journeyStatusMap.cancelledByDriver,
    "not seen by shipper yet",
    // WHERE clause
    userUniqueId,
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    journeyStatusMap.acceptedByShipper,
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
            WHERE cbr.shipperRequestBatchId = b.batchUniqueId
              AND cbr.bidStatus IN ('accepted_by_shipper', 'submitted')
          )
        THEN b.batchUniqueId
      END) as companyBatchWaitingCount,

      COALESCE(SUM(CASE
        WHEN b.journeyStatusId IN (?, ?)
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchId = b.batchUniqueId
              AND cbr.bidStatus IN ('accepted_by_shipper', 'submitted')
          )
        THEN b.totalVehicles
        ELSE 0
      END), 0) as companyBatchWaitingVehicles,

      COUNT(DISTINCT CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchId = b.batchUniqueId
              AND cbr.bidStatus = 'submitted'
          )
        THEN b.batchUniqueId
      END) as companyAuctionCount,

      -- companyAuctionVehicles: total vehicles in batches receiving bids (bidStatus=submitted)
      COALESCE(SUM(CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchId = b.batchUniqueId
              AND cbr.bidStatus = 'submitted'
          )
        THEN b.totalVehicles
        ELSE 0
      END), 0) as companyAuctionVehicles,

      COUNT(DISTINCT CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchId = b.batchUniqueId
              AND cbr.bidStatus = 'accepted_by_shipper'
          )
        THEN b.batchUniqueId
      END) as companyOngoingCount,

      COALESCE(SUM(CASE
        WHEN EXISTS (
            SELECT 1 FROM CompanyBidRequest cbr
            WHERE cbr.shipperRequestBatchId = b.batchUniqueId
              AND cbr.bidStatus = 'accepted_by_shipper'
          )
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
    userUniqueId,
  ];

  // ── Part 3: Company slot-level counts (flat — backward compat) ──────────
  // Counts journeyStarted / notSeenCompleted / notSeenCancelledByDriver for
  // company slots. Kept as-is; old consumers read these top-level keys.
  const companySlotQuery = `
    SELECT
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId = ?
        THEN pr.shipperRequestId END) AS companyJourneyStarted,

      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId = ? AND pr.isCompletionSeen = ?
        THEN pr.shipperRequestId END) AS companyNotSeenCompleted,

      COUNT(DISTINCT CASE
        WHEN jd.journeyStatusId = ?
          AND jd.isCancellationByDriverSeenByShipper = ?
        THEN pr.shipperRequestId END) AS companyNotSeenCancelledByDriver

    FROM ShipperRequest pr
    LEFT JOIN JourneyDecisions jd ON jd.shipperRequestId = pr.shipperRequestId
    WHERE pr.userUniqueId = ?
      AND pr.requestMode = 'company_target'
      AND pr.shipperRequestDeletedAt IS NULL
  `;

  const companySlotValues = [
    journeyStatusMap.journeyStarted,    // companyJourneyStarted
    journeyStatusMap.journeyCompleted,  // companyNotSeenCompleted status
    false,                              // companyNotSeenCompleted isCompletionSeen
    journeyStatusMap.cancelledByDriver, // companyNotSeenCancelledByDriver status
    "not seen by shipper yet",          // companyNotSeenCancelledByDriver seen flag
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
        WHEN pr.journeyStatusId = ?
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba
            WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
              AND cba.assignmentDeletedAt IS NULL
              AND cba.assignmentStatus NOT IN (
                'rejected_by_driver','cancelled_by_company',
                'cancelled_by_shipper','cancelled_by_driver'
              )
          )
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba2
            WHERE cba2.shipperRequestUniqueId = pr.shipperRequestUniqueId
              AND cba2.assignmentDeletedAt IS NULL
              AND cba2.assignmentStatus = 'cancelled_by_driver'
          )
        THEN pr.shipperRequestId END) AS notAssigned,

      -- needsReassignment: driver cancelled, slot is free again
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId = ?
          AND NOT EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba
            WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
              AND cba.assignmentDeletedAt IS NULL
              AND cba.assignmentStatus NOT IN (
                'rejected_by_driver','cancelled_by_company',
                'cancelled_by_shipper','cancelled_by_driver'
              )
          )
          AND EXISTS (
            SELECT 1 FROM CompanyBidVehicleAssignment cba2
            WHERE cba2.shipperRequestUniqueId = pr.shipperRequestUniqueId
              AND cba2.assignmentDeletedAt IS NULL
              AND cba2.assignmentStatus = 'cancelled_by_driver'
          )
        THEN pr.shipperRequestId END) AS needsReassignment,

      -- assigned: driver notified, waiting for driver to confirm
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM CompanyBidVehicleAssignment cba
          WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
            AND cba.assignmentDeletedAt IS NULL
            AND cba.assignmentStatus = 'assigned'
        )
        THEN pr.shipperRequestId END) AS assigned,

      -- driverConfirmed: driver confirmed or heading to loading point
      COUNT(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM CompanyBidVehicleAssignment cba
          WHERE cba.shipperRequestUniqueId = pr.shipperRequestUniqueId
            AND cba.assignmentDeletedAt IS NULL
            AND cba.assignmentStatus IN ('confirmed_by_driver','going_to_loading')
        )
        THEN pr.shipperRequestId END) AS driverConfirmed,

      -- journeyStarted: goods loaded, driver in transit
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId = ?
        THEN pr.shipperRequestId END) AS journeyStarted,

      -- completed: delivered but NOT YET SEEN by the shipper
      -- Once the shipper opens it and marks it seen, this drops to 0.
      -- Mirrors the same filter used in notSeenCompleted (Part 3).
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId = ?
          AND pr.isCompletionSeen = false
        THEN pr.shipperRequestId END) AS completed,

      /* -- cancelledByShipper: commented out — will restore later
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId = ?
        THEN pr.shipperRequestId END) AS cancelledByShipper,
      */

      -- total: active slots only — excludes cancelled (by anyone) and seen-completed.
      -- This is the clean denominator for the active dashboard view:
      --   total = notAssigned + needsReassignment + assigned + driverConfirmed
      --         + journeyStarted + completed(unseen)
      COUNT(DISTINCT CASE
        WHEN pr.journeyStatusId NOT IN (?, ?, ?, ?)   -- skip all cancel terminals
          AND NOT (pr.journeyStatusId = ? AND pr.isCompletionSeen = true) -- skip seen-completed
        THEN pr.shipperRequestId END) AS total

    FROM ShipperRequest pr
    WHERE pr.userUniqueId = ?
      AND pr.requestMode = 'company_target'
      AND pr.shipperRequestDeletedAt IS NULL
  `;

  const companyBreakdownValues = [
    journeyStatusMap.acceptedByShipper, // notAssigned: status check 1
    journeyStatusMap.acceptedByShipper, // needsReassignment: status check 2
    journeyStatusMap.journeyStarted,    // journeyStarted
    journeyStatusMap.journeyCompleted,  // completed (unseen only)
    // journeyStatusMap.cancelledByShipper, // cancelledByShipper — commented out
    // total: 4 cancel terminals + journeyCompleted for seen-completed exclusion
    journeyStatusMap.cancelledByShipper, // total: exclude cancelledByShipper
    journeyStatusMap.cancelledByDriver,  // total: exclude cancelledByDriver
    journeyStatusMap.cancelledByAdmin,   // total: exclude cancelledByAdmin
    journeyStatusMap.cancelledBySystem,  // total: exclude cancelledBySystem
    journeyStatusMap.journeyCompleted,   // total: exclude seen-completed (paired with isCompletionSeen=true)
    userUniqueId,
  ];

  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [prResult, batchResult, companySlotResult, companyBreakdownResult] = await Promise.all([
    queryExecutor.query(prQuery, prValues),
    queryExecutor.query(batchQuery, batchValues),
    queryExecutor.query(companySlotQuery, companySlotValues),
    queryExecutor.query(companyBreakdownQuery, companyBreakdownValues),
  ]);

  const pr          = prResult[0][0];
  const batch       = batchResult[0][0];
  const companySlot = companySlotResult[0][0];
  const bd          = companyBreakdownResult[0][0];   // breakdown

  const n = (v) => Number(v) || 0;

  const companyWaiting             = n(batch.companyBatchWaitingVehicles); // SUM(totalVehicles) ✅
  const companyBidding             = n(batch.companyAuctionVehicles);      // SUM(totalVehicles) ✅ (was batch count)
  const companyActive              = n(batch.companyOngoingVehicles);      // SUM(totalVehicles) ✅
  const companyJourneyStarted      = n(companySlot.companyJourneyStarted);
  const companyNotSeenCompleted    = n(companySlot.companyNotSeenCompleted);
  const companyNotSeenCancelled    = n(companySlot.companyNotSeenCancelledByDriver);

  const individualTotal = n(pr.totalCount);
  const totalCount = individualTotal
    + companyWaiting
    + companyBidding
    + companyActive
    + companyJourneyStarted
    + companyNotSeenCompleted
    + companyNotSeenCancelled;

  return {
    totalCount,
    waiting:                  { individual: n(pr.waitingCount),                  company: companyWaiting },
    requested:                { individual: n(pr.requestedCount),                company: 0 },
    acceptedByDriver:         { individual: n(pr.acceptedByDriverCount),         company: companyBidding },

    // ── acceptedByShipper: individual stays a plain number;
    //    company is a full pipeline breakdown of all slots under the won bid.
    //    Old consumers that read company as a number will get an object now
    //    (intentional — kept for migration period alongside old flat keys below).
    acceptedByShipper: {
      individual: n(pr.acceptedByShipperCount),
      company: {
        notAssigned:       n(bd.notAssigned),       // free slot (vehicle), never touched
        needsReassignment: n(bd.needsReassignment), // vehicle lost driver, needs new assign
        assigned:          n(bd.assigned),           // vehicle: driver notified, awaiting confirm
        driverConfirmed:   n(bd.driverConfirmed),   // vehicle: driver confirmed / loading
        journeyStarted:    n(bd.journeyStarted),    // vehicle: goods loaded, in transit
        completed:         n(bd.completed),         // vehicle: delivered
        // cancelledByShipper:n(bd.cancelledByShipper), // commented out — restore for history view
        // ongoingVehicles: total vehicles across accepted batches (vehicle unit, from Part 2)
        ongoingVehicles:   n(batch.companyOngoingVehicles),
        // batchCount: distinct accepted batches — used for frontend Ongoing list badge
        batchCount:        n(batch.companyOngoingCount),
        // active-only total: excludes cancelled (all types) + seen-completed
        // = notAssigned + needsReassignment + assigned + driverConfirmed + journeyStarted + completed(unseen)
        total:             n(bd.total),
      },
    },

    // ── Flat keys kept for backward compatibility — will be removed later ──
    journeyStarted:           { individual: n(pr.journeyStartedCount),           company: companyJourneyStarted },
    notSeenCompleted:         { individual: n(pr.notSeenCompletedCount),         company: companyNotSeenCompleted },
    notSeenCancelledByDriver: { individual: n(pr.notSeenCancelledByDriverCount), company: companyNotSeenCancelled },
  };
};




module.exports = {
  getShipperRequestByRequestUniqueId,
  checkActiveShipperRequest,
  getActiveRequestsCount
};