const Config = require("../../Utils/Config");
const { performJoinSelect } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { deleteData } = require("../../CRUD/Delete/DeleteData");
const { createNewPassengerRequest } = require("../../CRUD/Create/CreateData");
const batchService = require("../PassengerRequestBatch.service");
const { pool } = require("../../Middleware/Database.config");
const {
  journeyStatusMap,
  usersRoles,
  listOfDocumentsTypeAndId,
} = require("../../Utils/ListOfSeedData");
const logger = require("../../Utils/logger");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { executeInTransaction } = require("../../Utils/DatabaseTransaction");
// verifyPassengerStatus removed - only available via API endpoint to reduce heavy operations
const {
  handleWaitingRequest,
  verifyPassengerStatus,
} = require("./statusVerification.service");

/**
 * Creates a new passenger request
 *
 * This function consolidates three creation scenarios:
 * 1. **Passenger self-creates**: Sets audit fields from token, journeyStatusId = waiting
 * 2. **Admin creates for shipper**: Creates user first, sets audit fields from admin token, journeyStatusId = waiting
 * 3. **Driver takes from street**: Creates user first, sets audit fields from driver info, journeyStatusId = journeyStarted
 *
 * Note: Admin and driver user creation is handled by the caller before calling this function.
 * The caller must pass userUniqueId in the body (for passenger) or create user first (for admin/driver).
 *
 * Audit Trail:
 * - shipperRequestCreatedBy: userUniqueId of who created the request (passenger/admin/driver)
 * - shipperRequestCreatedByRoleId: roleId of who created the request (1=passenger, 2=driver, 3=admin)
 * These fields are extracted from body and stored in database to track request origin.
 *
 * Return Behavior:
 * - If shipperRequestCreatedByRoleId ===driverRoleId (2): Returns array of created requests directly
 *   (Driver scenario - no need for status counts, request is used immediately)
 * - Otherwise (passenger/admin): Returns verifyPassengerStatus result with status counts
 *   (Passenger/Admin scenario - frontend needs status counts for notifications)
 *
 * @param {Object} body - Request body data
 *   - userUniqueId: Required - Passenger's userUniqueId (set by caller)
 *   - shipperRequestCreatedBy: Required - userUniqueId of who created this request (audit trail)
 *   - shipperRequestCreatedByRoleId: Required - roleId of who created this request (1=passenger, 2=driver, 3=admin)
 *   - passengerRequestBatchId: Required - Batch ID for grouping related requests
 *   - numberOfVehicles: Optional - Number of   Vehicle needed (default: 1)
 *   - vehicle, destination, originLocation, shippingDate, deliveryDate, shippingCost, etc.
 * @param {number} journeyStatusId - Initial journey status ID
 *   - waiting (1): For passenger/admin scenarios (driver hasn't picked up yet)
 *   - journeyStarted (5): For driver "take from street" scenario (goods already picked up)
 * @param {Object} connection - Optional database connection for transaction support
 *   - If provided, all database operations use this connection (for atomicity)
 *   - If null, uses connection pool (default behavior)
 * @returns {Promise<Object|Array>}
 *   - If driver scenario: Returns array of created request objects directly
 *   - If passenger/admin scenario: Returns verifyPassengerStatus result with status counts
 *   - On error: Returns { message: "error", error: "error message" }
 */
const createPassengerRequest = async (body, journeyStatusId) => {
  try {
    const { shipperRequestCreatedByRoleId } = body;

    // Admin user creation is handled in controller before calling this function
    // userUniqueId must be set by the caller (controller handles admin case)
    const userUniqueId = body?.userUniqueId;
    if (!userUniqueId) {
      throw new AppError("userUniqueId is required", 400);
    }

    const numberOfVehicles = body?.numberOfVehicles || 1;
    // First check if the user has an active request based on passengerRequestBatchId
    const passengerRequestBatchId = body?.passengerRequestBatchId;
    if (!passengerRequestBatchId) {
      throw new AppError("Batch uniqueId Can't be null", 400);
    }

    // Use context-aware executor for raw query with locking
    const executor = transactionStorage.getStore() || pool;
    const batchCheckSql = `SELECT * FROM PassengerRequest WHERE passengerRequestBatchId = ? AND userUniqueId = ? FOR UPDATE`;
    const [dataByBatchId] = await executor.query(batchCheckSql, [
      passengerRequestBatchId,
      userUniqueId,
    ]);

    if (dataByBatchId?.length >= numberOfVehicles) {
      // User has already created all required requests for this batch
      throw new AppError(
        `All required requests have already been created for this batch.`,
        400,
      );
    }

    const newRequests = [];
    const noOfRecords = numberOfVehicles - dataByBatchId?.length;

    // Step 1: Create all requests in parallel for better performance
    // Parallel execution is safe because:
    // - Each request generates a unique UUID (passengerRequestUniqueId) - no conflicts
    // - Database auto-increment IDs (passengerRequestId) - order doesn't matter
    // - No dependencies between requests - each is independent
    // - Batch limit check happens before creation, so we create exactly noOfRecords
    if (noOfRecords > 0) {
      // Step 1a: Create the batch header ONCE before spawning parallel requests.
      // If this runs inside Promise.all, every concurrent call does SELECT → sees nothing
      // → all try to INSERT the same batchUniqueId → duplicate key crash.
      await batchService.upsertBatch({
        batchUniqueId:             passengerRequestBatchId,
        shipperUserUniqueId:       userUniqueId,
        vehicleTypeUniqueId:       body.vehicle?.vehicleTypeUniqueId,
        totalVehicles:             body.numberOfVehicles || 1,
        requestMode:               body.requestMode || "individual_target",
        targetCompanyUniqueId:     body.targetCompanyUniqueId || null,
        originLatitude:            body.originLocation?.latitude ?? null,
        originLongitude:           body.originLocation?.longitude ?? null,
        originPlace:               body.originLocation?.description || "",
        destinationLatitude:       body.destination?.latitude ?? null,
        destinationLongitude:      body.destination?.longitude ?? null,
        destinationPlace:          body.destination?.description || "",
        shippableItemName:         body.shippableItemName || null,
        shippableItemQtyInQuintal: body.shippableItemQtyInQuintal || null,
        shippingDate:              body.shippingDate || null,
        deliveryDate:              body.deliveryDate || null,
        shippingCost:              body.shippingCost || null,
        journeyStatusId,
      });

      // ── company_target mode: DEFER individual PR creation ──────────────────
      // For company_target requests, we only create the batch header now.
      // Individual PassengerRequest rows will be created lazily when the shipper
      // accepts a company bid (in updateBidStatus → accepted_by_shipper).
      //
      // Why?  1. Faster creation (1 insert vs N inserts)
      //       2. If deal fails → no orphaned PR rows to clean up
      //       3. No race conditions during bid acceptance
      const isCompanyTarget = (body.requestMode || "individual_target") === "company_target";

      if (isCompanyTarget) {
        logger.info("company_target batch created (PR rows deferred to bid acceptance)", {
          passengerRequestBatchId,
          totalVehicles: body.numberOfVehicles || 1,
          userUniqueId,
        });

        return await verifyPassengerStatus({ userUniqueId });
      }

      // Step 1b: Now create individual PassengerRequest rows in parallel — safe because
      //          the batch header already exists and upsertBatch is no longer called inside.
      const promises = Array(noOfRecords)
        .fill()
        .map(() =>
          createNewPassengerRequest(body, userUniqueId, journeyStatusId),
        );

      // Wait for all requests to be created in parallel
      const results = await Promise.all(promises);

      // Extract created requests from results
      results.forEach((result) => {
        if (result?.data?.[0]) {
          newRequests.push(result.data[0]);
        }
      });
    }

    // Step 2: Process driver finding in parallel for all waiting requests
    // Parallel execution is safe because:
    // - Each request operates on different passengerRequestId (no conflicts)
    // - Database operations (insert/update) are independent per passenger request
    // - Local arrays prevent race conditions on shared data structures
    // Note: Minor race condition on notifiedDrivers Set (check-then-add) may cause
    // duplicate notifications to the same driver, but this is acceptable and non-critical
    // Only individual requests get auto-matched to nearby drivers.
    // company_target requests go through company bid → dispatcher assignment flow.
    const waitingRequests = newRequests.filter(
      (req) =>
        req?.journeyStatusId === journeyStatusMap.waiting &&
        req?.requestMode !== "company_target",
    );

    if (waitingRequests.length > 0) {
      // Shared Set for notification deduplication across parallel requests
      // Note: There's a small window where duplicate notifications could occur if
      // the same driver is found by multiple requests simultaneously, but this is rare
      // and non-critical (driver just gets notified twice, which is acceptable)
      const notifiedDrivers = new Set();

      // Process all waiting requests in parallel for better performance
      await Promise.all(
        waitingRequests.map(async (createdRequest) => {
          // Local arrays per request to avoid race conditions on shared arrays
          const localDriversData = [];
          const localDrivers = [];
          const localDecisions = [];

          await handleWaitingRequest({
            passengerRequest: createdRequest,
            passengerRequestId: createdRequest.passengerRequestId,
            totalRecords: null, // Not needed for create flow
            pageSize: null,
            page: null,
            driversData: localDriversData,
            drivers: localDrivers,
            decisions: localDecisions,
            notifiedDrivers, // Shared Set for deduplication (minor race condition acceptable)
            userUniqueId, // Pass userUniqueId for audit columns
          });
        }),
      );
    }

    if (shipperRequestCreatedByRoleId === usersRoles.driverRoleId) {
      return newRequests;
    }
    return await verifyPassengerStatus({
      userUniqueId,
    });
  } catch (error) {
    logger.error("Error in createPassengerRequest service", {
      message: error.message,
      stack: error.stack,
      name: error.name,
      userUniqueId: body?.userUniqueId,
      shipperRequestCreatedByRoleId: body?.shipperRequestCreatedByRoleId,
      passengerRequestBatchId: body?.passengerRequestBatchId,
      vehicleTypeUniqueId: body?.vehicle?.vehicleTypeUniqueId,
    });
    throw new AppError(
      error.message || "Unable to create request",
      error.statusCode || 500,
    );
  }
};

/**
 * Gets a passenger request by passenger request ID
 * @param {number} passengerRequestId - Passenger request ID
 * @returns {Promise<Object>} Success or error response with request data
 */
const getPassengerRequestByPassengerRequestId = async (passengerRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { passengerRequestId },
    });
    return { message: "success", data: result[0] };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to get passenger request data", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("unable to get data", 500);
  }
};

/**
 * Gets a passenger request by passenger request unique ID
 * @param {string} passengerRequestUniqueId - Passenger request unique ID
 * @returns {Promise<Object>} Success or error response with request data
 */
// DEPRECATED: Use getPassengerRequest4allOrSingleUser with filters.passengerRequestUniqueId instead
// const getPassengerRequestByPassengerRequestUniqueId = async (
//   passengerRequestUniqueId
// ) => {
//   try {
//     const result = await performJoinSelect({
//       baseTable: "PassengerRequest",
//       joins: [
//         {
//           table: "Users",
//           on: "PassengerRequest.userUniqueId = Users.userUniqueId",
//         },
//       ],
//       conditions: {
//         passengerRequestUniqueId,
//       },
//     });

//     if (!result?.length) {
//       return { message: "error", error: "Request not found" };
//     }

//     return { message: "success", data: result[0] };
//   } catch (error) {
//     return { message: "error", error: "Unable to retrieve request" };
//   }
// };

/**
 * Gets passenger requests with filtering and pagination
 * @param {Object} params - Query parameters
 * @param {Object} params.data - Filter and pagination data
 * @returns {Promise<Object>} Passenger requests with pagination
 */
const getPassengerRequest4allOrSingleUser = async ({ data }) => {
  try {
    const { userUniqueId, target, page = 1, limit = 10, filters = {} } = data;
    const offset = (page - 1) * limit;

    let whereClause = "";
    let queryParams = [];
    let countParams = [];

    if (filters?.search) {
      // Find by phone or email or full name or shippableItemName or origin/destination places
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += ` (
    Users.phoneNumber LIKE ? OR 
    Users.email LIKE ? OR 
    Users.fullName LIKE ? OR
    PassengerRequest.shippableItemName LIKE ? OR
    PassengerRequest.originPlace LIKE ? OR
    PassengerRequest.destinationPlace LIKE ?
  )`;

      const searchPattern = `%${filters.search}%`;
      // Add the same pattern for all 6 conditions
      queryParams?.push(
        searchPattern, // phoneNumber
        searchPattern, // email
        searchPattern, // fullName
        searchPattern, // shippableItemName
        searchPattern, // originPlace
        searchPattern, // destinationPlace
      );
      countParams?.push(
        searchPattern, // phoneNumber
        searchPattern, // email
        searchPattern, // fullName
        searchPattern, // shippableItemName
        searchPattern, // originPlace
        searchPattern, // destinationPlace
      );
    }

    // Build WHERE clause based on target and filters
    if (target !== "all" && userUniqueId) {
      whereClause = " WHERE PassengerRequest.userUniqueId = ?";
      queryParams = [userUniqueId];
      countParams = [userUniqueId];
    }

    // Add additional filters if provided
    if (filters?.vehicleTypeUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.vehicleTypeUniqueId = ?";
      queryParams.push(filters.vehicleTypeUniqueId);
      countParams.push(filters.vehicleTypeUniqueId);
    }

    // If isCompletionSeen is provided
    if (filters?.isCompletionSeen !== undefined) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.isCompletionSeen = ?";
      queryParams.push(filters.isCompletionSeen);
      countParams.push(filters.isCompletionSeen);
    }

    // Handle multiple journeyStatusIds
    if (filters?.journeyStatusIds && filters.journeyStatusIds.length > 0) {
      whereClause += whereClause ? " AND " : " WHERE ";

      if (filters.journeyStatusIds.length === 1) {
        // Single value for efficiency
        whereClause += " PassengerRequest.journeyStatusId = ?";
        queryParams.push(filters.journeyStatusIds[0]);
        countParams.push(filters.journeyStatusIds[0]);
      } else {
        // Multiple values using IN clause
        const placeholders = filters.journeyStatusIds.map(() => "?").join(",");
        whereClause += ` PassengerRequest.journeyStatusId IN (${placeholders})`;
        queryParams.push(...filters.journeyStatusIds);
        countParams.push(...filters.journeyStatusIds);
      }
    }

    if (filters?.passengerRequestBatchId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.passengerRequestBatchId = ?";
      queryParams.push(filters.passengerRequestBatchId);
      countParams.push(filters.passengerRequestBatchId);
    }

    if (filters?.passengerRequestUniqueId) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.passengerRequestUniqueId = ?";
      queryParams.push(filters.passengerRequestUniqueId);
      countParams.push(filters.passengerRequestUniqueId);
    }

    // Filter by requestMode: 'open' (visible to all drivers) or 'company_target' (visible only to targeted company)
    if (filters?.requestMode) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.requestMode = ?";
      queryParams.push(filters.requestMode);
      countParams.push(filters.requestMode);
    }

    // Exclude a specific requestMode while keeping NULL rows (legacy individual requests).
    // e.g. excludeRequestMode='company_target' → AND (requestMode IS NULL OR requestMode != 'company_target')
    // Needed because individual completed view must not show company batch completions.
    if (filters?.excludeRequestMode) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " (PassengerRequest.requestMode IS NULL OR PassengerRequest.requestMode != ?)";
      queryParams.push(filters.excludeRequestMode);
      countParams.push(filters.excludeRequestMode);
    }

    // Add date range filters
    if (filters?.startDate && filters?.endDate) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause +=
        " PassengerRequest.shipperRequestCreatedAt BETWEEN ? AND ?";
      queryParams.push(filters.startDate, filters.endDate);
      countParams.push(filters.startDate, filters.endDate);
    } else if (filters?.startDate) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.shipperRequestCreatedAt >= ?";
      queryParams.push(filters.startDate);
      countParams.push(filters.startDate);
    } else if (filters?.endDate) {
      whereClause += whereClause ? " AND " : " WHERE ";
      whereClause += " PassengerRequest.shipperRequestCreatedAt <= ?";
      queryParams.push(filters.endDate);
      countParams.push(filters.endDate);
    }

    // Add sorting
    let orderBy = "ORDER BY PassengerRequest.passengerRequestId DESC";
    if (filters?.sortBy) {
      const validSortColumns = [
        "shipperRequestCreatedAt",
        "passengerRequestId",
        "originPlace",
        "destinationPlace",
        "fullName",
      ];
      const sortColumn = validSortColumns.includes(filters.sortBy)
        ? filters.sortBy
        : "passengerRequestId";
      const sortOrder =
        filters.sortOrder?.toUpperCase() === "ASC" ? "ASC" : "DESC";

      if (sortColumn === "fullName") {
        orderBy = `ORDER BY Users.fullName ${sortOrder}`;
      } else {
        orderBy = `ORDER BY PassengerRequest.${sortColumn} ${sortOrder}`;
      }
    }

    // Get paginated results - Include VehicleTypes join like original
    const sqlToGetRequests = `
      SELECT 
        PassengerRequest.*,
        Users.fullName,
        Users.email,
        Users.phoneNumber,
        VehicleTypes.vehicleTypeName
      FROM PassengerRequest 
      JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId
      JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = PassengerRequest.vehicleTypeUniqueId
      ${whereClause}
      ${orderBy}
      LIMIT ? OFFSET ?
    `;

    queryParams.push(parseInt(limit), offset);

    const [passengerRequests] = await pool.query(sqlToGetRequests, queryParams);

    const sqlCount = `
      SELECT COUNT(*) as total 
      FROM PassengerRequest 
      JOIN Users ON Users.userUniqueId = PassengerRequest.userUniqueId
      JOIN VehicleTypes ON VehicleTypes.vehicleTypeUniqueId = PassengerRequest.vehicleTypeUniqueId
      ${whereClause}
    `;

    const [countResult] = await pool.query(sqlCount, countParams);
    const total = countResult[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    // Format data with detailed journey information
    const formattedData = await getDetailedJourneyData(passengerRequests);

    return {
      message: "success",
      formattedData,
      pagination: {
        currentPage: parseInt(page),
        totalPages: totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: page < totalPages,
        hasPrev: page > 1,
        ...(userUniqueId && { userId: userUniqueId }),
      },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to update request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError(
      "Unable to get passenger requests",
      error.statusCode || 500,
    );
  }
};

/**
 * Enriches passenger requests (PRs) with their related driver data, decisions, vehicles, and journey info.
 *
 * Abbreviations used in this function:
 *  - PR  = PassengerRequest (a shipper's shipping request)
 *  - DR  = DriverRequest (a driver's response/bid to a PR)
 *  - JD  = JourneyDecision (links a PR ↔ DR with a status: accepted, cancelled, etc.)
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
 * Auto-correction: If a PR has no matching decisions (all drivers cancelled/rejected),
 * it is reset to status 1 (waiting) and excluded from the response.
 *
 * @param {Array<Object>} passengerRequests - Array of PR rows from the database
 * @returns {Promise<Array<Object>>} Array of enriched objects, each containing:
 *   - passengerRequest: the original PR row
 *   - driverRequests: array of DR rows with vehicleOfDriver and driverProfilePhoto
 *   - decisions: array of JD rows matching the PR's journeyStatusId
 *   - journey: Journey row (if started/completed) or empty object
 */
const getDetailedJourneyData = async (passengerRequests) => {
  return await executeInTransaction(async () => {
    const executor = transactionStorage.getStore() || pool;

    if (!passengerRequests || passengerRequests.length === 0) {
      return [];
    }

    const waitingResults = [];
    const activePRs = [];

    // --- Step 1: Pre-filter non-active PRs (no DB hit) ---
    for (const pr of passengerRequests) {
      if (
        pr.journeyStatusId === journeyStatusMap.waiting ||
        pr.journeyStatusId === journeyStatusMap.cancelledByPassenger ||
        pr.journeyStatusId === journeyStatusMap.cancelledByDriver
      ) {
        waitingResults.push({
          passengerRequest: pr,
          driverRequests: [],
          decisions: [],
          journey: {},
        });
      } else {
        activePRs.push(pr);
      }
    }

    if (activePRs.length === 0) {
      return waitingResults;
    }

    // --- Step 2: Batch fetch all active/positive decisions for all active PRs (1 query) ---
    const prIds = activePRs.map((pr) => pr.passengerRequestId);
    const positiveStatuses = [
      journeyStatusMap.requested,
      journeyStatusMap.acceptedByDriver,
      journeyStatusMap.acceptedByPassenger,
      journeyStatusMap.journeyStarted,
      journeyStatusMap.journeyCompleted,
    ];

    const [allDecisionsRaw] = await executor.query(
      `SELECT * FROM JourneyDecisions WHERE passengerRequestId IN (?) AND journeyStatusId IN (?)`,
      [prIds, positiveStatuses],
    );
    // Group decisions by passengerRequestId
    const decisionsByPR = new Map();
    for (const d of allDecisionsRaw) {
      // if decisionsByPR dont have the passengerRequestId as key, add it with an empty array
      if (!decisionsByPR.has(d.passengerRequestId)) {
        decisionsByPR.set(d.passengerRequestId, []);
      }
      // push the decision to the array of the passengerRequestId
      decisionsByPR.get(d.passengerRequestId).push(d);
    }

    // --- Step 3: Auto-correct stale PRs and handle status mismatches ---
    const stalePRIds = []; // PRs to reset to waiting
    const validPRs = []; // PRs with matching decisions
    const allDecisions = []; // Decisions matching current/updated status

    for (const pr of activePRs) {
      const decisions = decisionsByPR.get(pr.passengerRequestId) || [];

      if (decisions.length === 0) {
        // No matching active decisions — auto-correct to waiting if not already
        if (pr.journeyStatusId !== journeyStatusMap.waiting) {
          stalePRIds.push(pr.passengerRequestId);
        }
      } else {
        // Check if PR status needs advancement (status mismatch where decisions are ahead)
        const maxDecisionStatus = Math.max(
          ...decisions.map((d) => d.journeyStatusId),
        );
        if (maxDecisionStatus > pr.journeyStatusId) {
          logger.warn("@getDetailedJourneyData: auto-advancing PR status", {
            passengerRequestId: pr.passengerRequestId,
            oldStatus: pr.journeyStatusId,
            newStatus: maxDecisionStatus,
          });
          await executor.query(
            "UPDATE PassengerRequest SET journeyStatusId = ? WHERE passengerRequestId = ?",
            [maxDecisionStatus, pr.passengerRequestId],
          );
          pr.journeyStatusId = maxDecisionStatus; // Sync in-memory
        }

        // Collect decisions matching the final status
        const finalMatches = decisions.filter(
          (d) => d.journeyStatusId === pr.journeyStatusId,
        );
        if (finalMatches.length > 0) {
          allDecisions.push(...finalMatches);
          validPRs.push(pr);
        } else {
          // If no decisions match even after possible advancement, it's stale
          stalePRIds.push(pr.passengerRequestId);
        }
      }
    }

    // Batch update stale PRs to waiting
    if (stalePRIds.length > 0) {
      await executor.query(
        `UPDATE PassengerRequest SET journeyStatusId = ? WHERE passengerRequestId IN (?)`,
        [journeyStatusMap.waiting, stalePRIds],
      );
    }

    if (validPRs.length === 0) {
      return waitingResults;
    }

    // --- Step 4: Batch fetch all driver requests + user info (1 query) ---
    const allDriverRequestIds = allDecisions.map((d) => d.driverRequestId);
    const uniqueDriverRequestIds = [...new Set(allDriverRequestIds)];

    let driversByRequestId = new Map();
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
    //if the journeyStatusId is journeyStarted or journeyCompleted, then fetch the journey data
    const journeyStatuses = [
      journeyStatusMap.journeyStarted,
      journeyStatusMap.journeyCompleted,
    ];
    const prsNeedingJourney = validPRs.filter((pr) =>
      journeyStatuses.includes(pr.journeyStatusId),
    );
    // console.log("@prsNeedingJourney", prsNeedingJourney);
    let journeyByDecisionUniqueId = new Map();
    if (prsNeedingJourney.length > 0) {
      // Collect ALL decision unique IDs for PRs needing journey data — not just decisions[0],
      // because a PR may have multiple decisions (e.g. one rejected, one accepted/completed).
      // We search across all of them so the correct journey record is always found.
      const journeyDecisionUniqueIds = prsNeedingJourney
        .flatMap((pr) => {
          const decisions = decisionsByPR.get(pr.passengerRequestId) || [];
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
      }
    }

    // --- Step 8: Assemble results (pure JS, no queries) ---
    const activeResults = validPRs.map((pr) => {
      const decisions = decisionsByPR.get(pr.passengerRequestId) || [];

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

      const useJourney = journeyStatuses.includes(pr.journeyStatusId);
      let journey = {};
      if (useJourney) {
        // Find the specific decision that matches the PR's final status.
        // A PR can have multiple decisions (e.g. one rejected offer + one completed offer).
        // Using decisions[0] would pick the wrong one if it's the older, non-journey decision.
        const journeyDecision =
          decisions.find((d) => d.journeyStatusId === pr.journeyStatusId) ||
          decisions[0];
        if (journeyDecision?.journeyDecisionUniqueId) {
          journey =
            journeyByDecisionUniqueId.get(
              journeyDecision.journeyDecisionUniqueId,
            ) || {};
        }
      }

      return {
        passengerRequest: pr,
        driverRequests,
        decisions,
        journey,
      };
    });

    return [...waitingResults, ...activeResults];
  });
};

/**
 * Updates a passenger request by ID
 * @param {number} requestId - Passenger request ID
 * @param {Object} updates - Update values
 * @returns {Promise<Object>} Success or error response
 */
const updateRequestById = async (requestId, updates) => {
  try {
    const result = await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: requestId },
      updateValues: updates,
    });

    if (result.affectedRows === 0) {
      throw new AppError("Request not found or no changes made", 404);
    }

    return { message: "success", data: "Request updated successfully" };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to update request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Unable to update request", error.statusCode || 500);
  }
};

/**
 * Deletes a passenger request by ID
 * @param {number} requestId - Passenger request ID
 * @returns {Promise<Object>} Success or error response
 */
const deleteRequest = async (requestId) => {
  try {
    const result = await deleteData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: requestId },
    });

    if (result.affectedRows === 0) {
      throw new AppError("Request not found", 404);
    }

    return { message: "success", data: "Request deleted successfully" };
  } catch (error) {
    const logger = require("../../Utils/logger");
    logger.error("Unable to delete request", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Unable to delete request", error.statusCode || 500);
  }
};

/**
 * Get All Active Requests
 *
 * Purpose: Retrieves all active passenger requests (waiting, requested, acceptedByDriver)
 * for drivers to view available journeys.
 *
 * @param {Object} filters - Filtering options
 * @param {string} filters.userUniqueId - Filter by passenger user ID
 * @param {string} filters.email - Filter by passenger email (partial match)
 * @param {string} filters.phoneNumber - Filter by passenger phone (partial match)
 * @param {string} filters.fullName - Filter by passenger name (partial match)
 * @param {string} filters.vehicleTypeUniqueId - Filter by vehicle type
 * @param {number} filters.journeyStatusId - Filter by specific journey status
 * @param {string} filters.shippableItemName - Filter by item name (partial match)
 * @param {string} filters.originPlace - Filter by origin location (partial match)
 * @param {string} filters.destinationPlace - Filter by destination location (partial match)
 * @param {string} filters.startDate - Filter requests from this date
 * @param {string} filters.endDate - Filter requests until this date
 * @param {string} filters.shippingDate - Filter by shipping date
 * @param {string} filters.deliveryDate - Filter by delivery date
 * @param {number} filters.page - Page number (default: 1)
 * @param {number} filters.limit - Results per page (default: 2)
 * @param {string} filters.sortBy - Field to sort by (default: "requestTime")
 * @param {string} filters.sortOrder - Sort direction "ASC" or "DESC" (default: "DESC")
 * @returns {Promise<Object>} Response with data, pagination, and filters
 */
const getAllActiveRequests = async (filters = {}) => {
  const {
    // User filters
    userUniqueId,
    email,
    phoneNumber,
    fullName,

    // Request filters
    vehicleTypeUniqueId,
    journeyStatusId,
    shippableItemName,

    // Location filters
    originPlace,
    destinationPlace,

    // Date filters
    startDate,
    endDate,
    shippingDate,
    deliveryDate,

    // Pagination
    page = 1,
    limit = 2,

    // Sorting
    sortBy = "shipperRequestCreatedAt",
    sortOrder = "DESC",
  } = filters;

  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.acceptedByDriver,
  ];

  // Base query
  let baseQuery = `
    SELECT 
      pr.*, 
      u.fullName,
      u.phoneNumber,
      u.email,
      u.userCreatedAt as userCreatedAt,
      vt.vehicleTypeName,
      js.journeyStatusName  
    FROM PassengerRequest pr
    JOIN Users u ON u.userUniqueId = pr.userUniqueId 
    LEFT JOIN VehicleTypes vt ON pr.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON pr.journeyStatusId = js.journeyStatusId
    WHERE pr.journeyStatusId IN (?)
  `;

  let whereConditions = [];
  let values = [activeStatusIds];

  // User filters
  if (userUniqueId) {
    whereConditions.push("pr.userUniqueId = ?");
    values.push(userUniqueId);
  }

  if (email) {
    whereConditions.push("u.email LIKE ?");
    values.push(`%${email}%`);
  }

  if (phoneNumber) {
    whereConditions.push("u.phoneNumber LIKE ?");
    values.push(`%${phoneNumber}%`);
  }

  if (fullName) {
    whereConditions.push("u.fullName LIKE ?");
    values.push(`%${fullName}%`);
  }

  // Request filters
  if (vehicleTypeUniqueId) {
    whereConditions.push("pr.vehicleTypeUniqueId = ?");
    values.push(vehicleTypeUniqueId);
  }

  if (journeyStatusId) {
    whereConditions.push("pr.journeyStatusId = ?");
    values.push(journeyStatusId);
  }

  if (shippableItemName) {
    whereConditions.push("pr.shippableItemName LIKE ?");
    values.push(`%${shippableItemName}%`);
  }

  // Location filters
  if (originPlace) {
    whereConditions.push("pr.originPlace LIKE ?");
    values.push(`%${originPlace}%`);
  }

  if (destinationPlace) {
    whereConditions.push("pr.destinationPlace LIKE ?");
    values.push(`%${destinationPlace}%`);
  }

  // Date filters
  if (startDate && endDate) {
    whereConditions.push("pr.shipperRequestCreatedAt BETWEEN ? AND ?");
    values.push(startDate, endDate);
  } else if (startDate) {
    whereConditions.push("pr.shipperRequestCreatedAt >= ?");
    values.push(startDate);
  } else if (endDate) {
    whereConditions.push("pr.shipperRequestCreatedAt <= ?");
    values.push(endDate);
  }

  if (shippingDate) {
    whereConditions.push("DATE(pr.shippingDate) = ?");
    values.push(shippingDate);
  }

  if (deliveryDate) {
    whereConditions.push("DATE(pr.deliveryDate) = ?");
    values.push(deliveryDate);
  }

  // Add WHERE conditions to base query
  if (whereConditions.length > 0) {
    baseQuery += " AND " + whereConditions.join(" AND ");
  }

  // Count query for total records
  const countQuery = `SELECT COUNT(*) as totalCount FROM (${baseQuery}) as countTable`;

  // Add sorting and pagination to main query
  const offset = (page - 1) * limit;
  baseQuery += ` ORDER BY pr.${sortBy} ${sortOrder} LIMIT ? OFFSET ?`;
  values.push(parseInt(limit), parseInt(offset));

  try {
    // Execute both queries
    const [countResults] = await pool.query(countQuery, values.slice(0, -2)); // Remove LIMIT and OFFSET values for count
    const [results] = await pool.query(baseQuery, values);

    const totalCount = countResults[0]?.totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);

    return {
      status: "success",
      data: results,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNext: page < totalPages,
        hasPrevious: page > 1,
        pageSize: parseInt(limit),
      },
      filters: {
        applied: whereConditions.length > 0 ? filters : {},
        activeStatusIds,
      },
    };
  } catch (error) {
    logger.error("Error in getAllActiveRequests", {
      error: error.message,
      stack: error.stack,
    });
    return {
      status: "error",
      error: "Unable to retrieve active ride requests",
      details: Config.NODE_ENV === "development" ? error.message : undefined,
    };
  }
};

/**
 * Fetches a single PassengerRequest by its UUID.
 *
 * This is the dedicated, reusable service function for looking up a passenger
 * request by unique ID. Used by CompanyAssignment.service.js and any other
 * service that needs to resolve a passengerRequestUniqueId → row without
 * duplicating raw SQL.
 *
 * @param {string} passengerRequestUniqueId  - UUID of the request
 * @param {string} [passengerRequestBatchId] - Optional: also validates batch membership
 * @returns {Promise<Object>}  The matched row or null if not found
 * @throws {AppError} 404 if not found, 400 if batchId provided but does not match
 */
const getPassengerRequestByUniqueId = async (
  passengerRequestUniqueId,
  passengerRequestBatchId = null,
) => {
  let sql = `SELECT passengerRequestId,
                    passengerRequestUniqueId,
                    passengerRequestBatchId,
                    vehicleTypeUniqueId,
                    journeyStatusId,
                    originLatitude,
                    originLongitude,
                    originPlace,
                    userUniqueId
             FROM PassengerRequest
             WHERE passengerRequestUniqueId = ?
               AND passengerRequestDeletedAt IS NULL`;
  const params = [passengerRequestUniqueId];

  if (passengerRequestBatchId) {
    sql += " AND passengerRequestBatchId = ?";
    params.push(passengerRequestBatchId);
  }

  sql += " LIMIT 1";

  const [rows] = await pool.query(sql, params);

  if (!rows || rows.length === 0) {
    if (passengerRequestBatchId) {
      throw new AppError(
        "Passenger request does not belong to this bid's batch",
        400,
      );
    }
    throw new AppError("Passenger request not found", 404);
  }

  return rows[0];
};

module.exports = {
  createPassengerRequest,
  getPassengerRequestByPassengerRequestId,
  getPassengerRequestByUniqueId,
  getPassengerRequest4allOrSingleUser,
  getDetailedJourneyData,
  updateRequestById,
  deleteRequest,
  getAllActiveRequests,
};
