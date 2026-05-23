const { pool } = require("../../Middleware/Database.config");
const {
  journeyStatusMap,
  activeJourneyStatuses,
} = require("../../Utils/ListOfSeedData");
const {
  VerifyIfShipperRequestWasNotRejected,
} = require("../../Utils/RejectedRequests");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
// Maximum matching radius in kilometres for driver ↔ shipper proximity
const MAX_RADIUS_KM = 10;
// Bounding-box pre-filter in degrees (1° lat ≈ 111 km → 10 km ≈ 0.09°).
// Slightly enlarged to avoid clipping true great-circle matches near the edge.
const DEGREE_BUFFER = MAX_RADIUS_KM / 111 + 0.01; // ≈ 0.10°

const getData = async ({
  tableName,
  conditions = {}, // Default to an empty object
  operator = "AND",
  orderBy = null,
  orderDirection = "ASC",
  limit = null,
  offset = null,
  connection = null, // Optional: connection for transaction support
}) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  let whereClause = "";
  let values = [];

  // Build the WHERE clause dynamically based on the conditions object
  if (Object.keys(conditions).length > 0) {
    whereClause =
      "WHERE " +
      Object.keys(conditions)
        .map((col) => {
          const value = conditions[col];
          if (value === null) {
            return `${col} IS NULL`;
          } else if (Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            return `${col} IN (${placeholders})`;
          } else {
            return `${col} = ?`;
          }
        })
        .join(` ${operator} `);

    // Flatten the values array, excluding null values
    values = Object.values(conditions)
      .filter((value) => value !== null)
      .flat();
  }

  // Initialize the base query
  let sqlQuery = `SELECT * FROM ${tableName} ${whereClause}`;
  // Add ORDER BY clause if provided
  if (orderBy) {
    sqlQuery += ` ORDER BY ${orderBy} ${orderDirection}`;
  }

  // Add LIMIT clause if provided
  if (limit) {
    sqlQuery += ` LIMIT ${limit}`;
    if (offset) {
      sqlQuery += ` OFFSET ${offset}`;
    }
  }

  // Execute the query and return the result
  try {
    // Use context connection first, then provided connection, or fall back to pool
    const queryExecutor = transactionStorage.getStore() || connection || pool;
    const [result] = await queryExecutor.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    throw error;
  }
};
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
const findNearbyDrivers = async ({ shipperRequest }) => {
  // Destructure the relevant data from the shipperRequest
  const {
    originLatitude,
    originLongitude,
    vehicleTypeUniqueId,
    shipperRequestId,
  } = shipperRequest;

  const lat = Number.parseFloat(originLatitude);
  const lng = Number.parseFloat(originLongitude);

  // Bounding-box pre-filter (fast index scan) then exact Haversine check (≤ MAX_RADIUS_KM)
  // Haversine formula gives the great-circle distance in km between two lat/lng points.
  const sqlQuery = `
      SELECT
         *,
         (
           6371 * 2 * ASIN(SQRT(
             POWER(SIN(RADIANS(DriverRequest.originLatitude - ?) / 2), 2) +
             COS(RADIANS(?)) * COS(RADIANS(DriverRequest.originLatitude)) *
             POWER(SIN(RADIANS(DriverRequest.originLongitude - ?) / 2), 2)
           ))
         ) AS distanceKm
      FROM DriverRequest
      JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      JOIN VehicleDriver vd ON vd.driverUserUniqueId = Users.userUniqueId
      JOIN Vehicle ON vd.vehicleUniqueId = Vehicle.vehicleUniqueId
      JOIN VehicleTypes ON Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId
      WHERE
        DriverRequest.originLatitude  BETWEEN ? AND ?
        AND DriverRequest.originLongitude BETWEEN ? AND ?
        AND DriverRequest.journeyStatusId = 1 -- Status 'Waiting'
        AND vd.assignmentStatus = 'active'
        AND Vehicle.vehicleTypeUniqueId = ?
      HAVING distanceKm <= ?
      ORDER BY distanceKm ASC
      LIMIT 10
    `;

  const values = [
    // Haversine inputs
    lat,
    lat,
    lng,
    // Bounding-box pre-filter
    lat - DEGREE_BUFFER,
    lat + DEGREE_BUFFER,
    lng - DEGREE_BUFFER,
    lng + DEGREE_BUFFER,
    vehicleTypeUniqueId,
    MAX_RADIUS_KM,
  ];

  // Execute the query
  const queryExecutor = transactionStorage.getStore() || pool;
  const [drivers] = await queryExecutor.query(sqlQuery, values);
  const listOfDrivers = [];
  for (const driver of drivers) {
    const { message } = await VerifyIfShipperRequestWasNotRejected({
      shipperRequestId,
      driverUserUniqueId: driver?.userUniqueId,
    });
    if (message === "success") {
      // push 5 drivers only
      if (listOfDrivers.length >= 5) {
        break;
      }
      // push driver to list of drivers
      listOfDrivers?.push(driver);
    }
  }
  // Return the list of nearby drivers
  return listOfDrivers;
};

const findNearbyShippers = async ({
  originLatitude,
  originLongitude,
  vehicleTypeUniqueId,
}) => {
  const lat = parseFloat(originLatitude);
  const lng = parseFloat(originLongitude);

  // Use Haversine inside a raw query so we can apply the exact radius check.
  // A bounding-box pre-filter on indexed lat/lng columns keeps the scan fast.
  const sqlQuery = `
    SELECT
      Users.*,
      ShipperRequest.*,
      (
        6371 * 2 * ASIN(SQRT(
          POWER(SIN(RADIANS(ShipperRequest.originLatitude - ?) / 2), 2) +
          COS(RADIANS(?)) * COS(RADIANS(ShipperRequest.originLatitude)) *
          POWER(SIN(RADIANS(ShipperRequest.originLongitude - ?) / 2), 2)
        ))
      ) AS distanceKm
    FROM Users
    JOIN ShipperRequest
      ON ShipperRequest.userUniqueId = Users.userUniqueId
      AND (ShipperRequest.requestMode IS NULL OR ShipperRequest.requestMode != 'company_target')
      AND ShipperRequest.shipperRequestDeletedAt IS NULL
    WHERE
      ShipperRequest.vehicleTypeUniqueId = ?
      AND ShipperRequest.originLatitude  BETWEEN ? AND ?
      AND ShipperRequest.originLongitude BETWEEN ? AND ?
      AND ShipperRequest.journeyStatusId IN (?, ?, ?)
    HAVING distanceKm <= ?
    ORDER BY distanceKm ASC
  `;

  const values = [
    // Haversine inputs
    lat,
    lat,
    lng,
    // Exact filter conditions
    vehicleTypeUniqueId,
    lat - DEGREE_BUFFER,
    lat + DEGREE_BUFFER,
    lng - DEGREE_BUFFER,
    lng + DEGREE_BUFFER,
    journeyStatusMap.waiting,
    journeyStatusMap.requested,
    journeyStatusMap.acceptedByDriver,
    MAX_RADIUS_KM,
  ];

  const queryExecutor = transactionStorage.getStore() || pool;
  const [nearByShippers] = await queryExecutor.query(sqlQuery, values);
  return nearByShippers;
};

const performJoinSelect = async ({
  baseTable,
  joins = [],
  conditions = {},
  operator = "AND",
  orderBy = null,
  orderDirection = "ASC",
  limit = null,
  offset = null,
  groupBy = null, // Optional group by column
  connection = null,
  selectColumns = "*", // Optional specific columns
}) => {
  // Validate the operator
  if (operator !== "AND" && operator !== "OR") {
    throw new Error('Invalid operator. Only "AND" and "OR" are allowed.');
  }

  // Build WHERE clause dynamically based on conditions
  const columns = Object.keys(conditions);
  const whereClause =
    columns.length > 0
      ? `WHERE ${columns
        .map((col) => {
          const value = conditions[col];
          if (Array.isArray(value) && value.length === 2) {
            return `${col} BETWEEN ? AND ?`;
          } else if (Array.isArray(value)) {
            const placeholders = value.map(() => "?").join(", ");
            return `${col} IN (${placeholders})`;
          } else {
            return `${col} = ?`;
          }
        })
        .join(` ${operator} `)}`
      : ""; // No WHERE clause if conditions are empty

  const values = Object.values(conditions).flat();
  const joinClauses = joins
    .map(({ table, on }) => `JOIN ${table} ON ${on}`)
    .join(" ");
  const orderByClause = orderBy ? ` ORDER BY ${orderBy} ${orderDirection}` : "";
  const limitClause = limit ? ` LIMIT ${limit}` : "";
  const offsetClause = offset ? ` OFFSET ${offset}` : "";
  const groupByClause = groupBy ? ` GROUP BY ${groupBy}` : ""; // Optional group by

  // Construct the final SQL query
  const sqlQuery = `SELECT ${selectColumns} FROM ${baseTable} ${joinClauses} ${whereClause} ${groupByClause} ${orderByClause} ${limitClause} ${offsetClause}`;

  try {
    // Use provided connection for transaction support, context store, or fall back to pool
    const queryExecutor = transactionStorage.getStore() || connection || pool;
    const [result] = await queryExecutor.query(sqlQuery, values);
    return result; // Return the result set
  } catch (error) {
    throw error;
  }
};

const checkUserExists = async (userUniqueId) => {
  const existingUser = await getData({
    tableName: "Users",
    conditions: { userUniqueId },
  });

  return existingUser?.length ? existingUser[0] : null;
};
//checkActiveShipperRequest is used to get active shipper request from shipper request table, user table ,journey decisions table

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

  // ── Part 4: Detailed company slot breakdown (nested under acceptedByShipper) ──
  // After bid acceptance each slot has its own sub-state driven by
  // CompanyBidVehicleAssignment.assignmentStatus + ShipperRequest.journeyStatusId.
  // This gives the shipper full visibility into the assignment pipeline.
  //
  // Sub-states (mutually exclusive priority order):
  //   notAssigned      — free slot, never had a driver (ready to assign)
  //   needsReassignment— free slot, previous driver cancelled (should reassign)
  //   assigned         — driver notified, awaiting confirmation
  //   driverConfirmed  — driver confirmed / heading to loading point
  //   journeyStarted   — goods loaded, in transit
  //   completed        — delivered (may not have been seen by shipper yet)
  //   cancelledByShipper — shipper cancelled this slot
  //   total            — total company slots created under this shipper
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

      -- total: all non-deleted company slots for this shipper
      COUNT(DISTINCT pr.shipperRequestId) AS total

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
        // cancelledByShipper:n(bd.cancelledByShipper), // commented out — will restore later
        // ongoingVehicles: total vehicles across all accepted batches (same unit as other fields)
        ongoingVehicles:   n(batch.companyOngoingVehicles),
        // batchCount: number of distinct accepted batches — used for frontend list badge
        batchCount:        n(batch.companyOngoingCount),
        total:             n(bd.total),             // total vehicle slots created
      },
    },

    // ── Flat keys kept for backward compatibility — will be removed later ──
    journeyStarted:           { individual: n(pr.journeyStartedCount),           company: companyJourneyStarted },
    notSeenCompleted:         { individual: n(pr.notSeenCompletedCount),         company: companyNotSeenCompleted },
    notSeenCancelledByDriver: { individual: n(pr.notSeenCancelledByDriverCount), company: companyNotSeenCancelled },
  };
};



const checkActiveDriverRequest = async (userUniqueId) => {
  try {
    // Build placeholders for IN clause
    const activeStatusPlaceholders = activeJourneyStatuses
      .map(() => "?")
      .join(", ");

    const query = `
      SELECT DISTINCT
        DriverRequest.*,
        Users.fullName,
        Users.phoneNumber,
        Users.email,
        JourneyDecisions.isNotSelectedSeenByDriver,
        JourneyDecisions.isRejectionByShipperSeenByDriver
      FROM DriverRequest
      INNER JOIN Users ON DriverRequest.userUniqueId = Users.userUniqueId
      LEFT JOIN JourneyDecisions ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE DriverRequest.userUniqueId = ?
      AND (
        -- Active statuses
        DriverRequest.journeyStatusId IN (${activeStatusPlaceholders})
        OR
        -- notSelectedInBid (14) with not seen status
        (
          DriverRequest.journeyStatusId = ?
          AND JourneyDecisions.isNotSelectedSeenByDriver = 'not seen by driver yet'
        )
        OR
        -- Cancellation statuses (7, 10) with not seen status
        (
          DriverRequest.journeyStatusId IN (?, ?)
          AND DriverRequest.isCancellationByShipperSeenByDriver = 'not seen by driver yet'
        )
        OR
        -- rejectedByShipper (8) with not seen status
        (
          DriverRequest.journeyStatusId = ?
          AND JourneyDecisions.isRejectionByShipperSeenByDriver = 'not seen by driver yet'
        )
      )
      ORDER BY DriverRequest.driverRequestId DESC
      LIMIT 1
    `;

    const queryExecutor = transactionStorage.getStore() || pool;
    const [results] = await queryExecutor.query(query, [
      userUniqueId,
      ...activeJourneyStatuses,
      journeyStatusMap.notSelectedInBid,
      journeyStatusMap.cancelledByShipper,
      journeyStatusMap.cancelledByAdmin,
      journeyStatusMap.rejectedByShipper,
    ]);

    return results; // Returns an array of active requests (if any)
  } catch (error) {
    throw error;
  }
};

const getCancellationDetails = async (contextId) => {
  const result = await performJoinSelect({
    baseTable: "CanceledJourneys",
    joins: [
      {
        table: "CancellationReasonsType",
        on: "CanceledJourneys.cancellationReasonsTypeId = CancellationReasonsType.cancellationReasonsTypeId",
      },
    ],
    conditions: {
      "CanceledJourneys.contextId": contextId,
    },
    orderBy: "CanceledJourneys.canceledTime",
    orderDirection: "DESC",
    limit: 1,
  });

  if (!result || result.length === 0) {
    return null;
  }
  return result[0];
};

const getDriverRequestByRequestUniqueId = async (driverRequestUniqueId) => {
  const result = await performJoinSelect({
    baseTable: "DriverRequest",
    joins: [
      {
        table: "Users",
        on: "DriverRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: {
      driverRequestUniqueId: driverRequestUniqueId,
    },
  });

  if (!result?.length) {
    throw new AppError("Request not found", 404);
  }

  return result[0];
};
const getAttachedDocumentsByUserUniqueIdAndDocumentTypeId = async (
  ownerUserUniqueId,
  documentTypeId,
  connection = null,
) => {
  const sqlToGetDocument = `select * from AttachedDocuments, DocumentTypes where attachedDocumentCreatedByUserId=? and DocumentTypes.documentTypeId=?`;
  const values = [ownerUserUniqueId, documentTypeId];
  const queryExecutor = transactionStorage.getStore() || connection || pool;
  const [documents] = await queryExecutor.query(sqlToGetDocument, values);

  return {
    message: "success",
    data: documents,
  };
};
module.exports = {
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
  getDriverRequestByRequestUniqueId,
  checkActiveDriverRequest,
  checkActiveShipperRequest,
  checkUserExists,
  performJoinSelect,
  findNearbyDrivers,
  findNearbyShippers,
  getData,
  getShipperRequestByRequestUniqueId,
  getCancellationDetails,
};
