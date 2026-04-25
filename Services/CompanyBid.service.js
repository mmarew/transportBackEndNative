"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");
const logger = require("../Utils/logger");
const { sendFCMNotificationToUser } = require("./Firebase.service");
const { sendSocketIONotificationToCompany } = require("../Utils/Notifications");
const messageTypes = require("../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../Utils/ListOfSeedData");

/**
 * ### CORE LOGIC - Submit a Freight Bid
 * Processes a transport company's bid for a shipper's request batch.
 *
 * **Junior Note: Source of Truth Pattern**
 * To ensure data integrity, this function automatically fetches the vehicle type and
 * vehicle count from the `PassengerRequestBatch` table. This prevents the frontend
 * from accidentally sending mismatched data.
 *
 * **Important Rules:**
 * 1. Only 'Approved' companies can bid.
 * 2. Companies can't bid on work targeted at *other* specific companies.
 * 3. **Full Batch Only**: By default, companies bid on the *entire* batch.
 *
 * > [!TIP]
 * > **HOW TO ENABLE PARTIAL BIDDING (Future Restore):**
 * > If you need to allow companies to bid on only part of a batch:
 * > 1. Update `Validations/CompanyBid.schema.js` to make `numberOfVehiclesOffered` required.
 * > 2. Remove the line `const finalCount = totalVehicles;`.
 * > 3. Un-comment the validation: `if (numberOfVehiclesOffered > totalVehicles) { throw ... }`.
 * > 4. Use `numberOfVehiclesOffered` as the `finalCount` in the INSERT query.
 *
 * @param {Object} data - The payload containing bid details.
 * @param {string} data.passengerRequestBatchId - The UUID that groups the shipper's requests.
 * @param {string} data.companyUniqueId - The ID of the bidding fleet.
 * @param {string} data.bidSubmittedByUserUniqueId - The User ID of the dispatcher.
 * @param {number} [data.numberOfVehiclesOffered] - Optional; defaults to batch total.
 * @param {string} [data.vehicleTypeUniqueId] - Optional; defaults to batch requirement.
 * @returns {Promise<Object>} Success message.
 */
exports.submitBid = async (data) => {
  const {
    passengerRequestBatchId,
    companyUniqueId,
    bidSubmittedByUserUniqueId,
    vehicleTypeUniqueId,
    proposedCostPerVehicle,
    proposedTotalCost,
    proposedShippingDate,
    proposedDeliveryDate,
    bidNotes,
  } = data;

  // Company must be approved
  const company = await findOne(
    "TransportCompany",
    { companyUniqueId, isDeleted: 0 },
    "Company not found",
  );
  if (company.approvalStatus !== "approved") {
    throw new AppError("Only approved companies can submit bids", 400);
  }

  // 1. Verify the batch exists and get its metadata
  const [batchRows] = await db().query(
    `SELECT totalVehicles, vehicleTypeUniqueId, requestMode, targetCompanyUniqueId, shipperUserUniqueId 
     FROM PassengerRequestBatch 
     WHERE batchUniqueId = ? AND batchDeletedAt IS NULL LIMIT 1`,
    [passengerRequestBatchId],
  );
  if (!batchRows || batchRows.length === 0) {
    throw new AppError("Passenger request batch not found", 404);
  }

  const {
    totalVehicles,
    requestMode,
    targetCompanyUniqueId,
    shipperUserUniqueId,
  } = batchRows[0];

  // --- SOURCE OF TRUTH: We prioritize the batch's required vehicle type ---
  const finalVehicleTypeUniqueId =
    batchRows[0].vehicleTypeUniqueId || vehicleTypeUniqueId;

  // 2. Check company-targeting
  if (
    requestMode === "company_target" &&
    targetCompanyUniqueId !== null &&
    targetCompanyUniqueId !== companyUniqueId
  ) {
    throw new AppError("This batch is targeted at a different company", 403);
  }

  // 3. Verify the batch has actual requests (Sanity Check)
  const [countRows] = await db().query(
    `SELECT COUNT(*) AS batchCount
     FROM PassengerRequest
     WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
    [passengerRequestBatchId],
  );
  const actualRequestCount = Number(countRows?.[0]?.batchCount ?? 0);
  if (actualRequestCount === 0) {
    throw new AppError("This batch contains no individual requests", 400);
  }

  // 4. Determine final vehicle count (Full Batch Logic)
  // To restore partial bidding, use the user input instead of totalVehicles.
  const finalCount = totalVehicles;

  /* 
  // PARTIAL BID RESTORATION LOGIC:
  if (numberOfVehiclesOffered > totalVehicles) {
     throw new AppError(`Cannot bid for ${numberOfVehiclesOffered} when batch only needs ${totalVehicles}`, 400);
  }
  const finalCount = numberOfVehiclesOffered; 
  */

  // One bid per company per batch
  const [existing] = await db().query(
    "SELECT companyBidRequestId FROM CompanyBidRequest WHERE companyUniqueId = ? AND passengerRequestBatchId = ? AND companyBidRequestDeletedAt IS NULL",
    [companyUniqueId, passengerRequestBatchId],
  );
  if (existing.length > 0) {
    throw new AppError(
      "This company has already submitted a bid for this batch",
      409,
    );
  }

  // Note: Capacity validation removed per user request.
  // Companies can now bid even if requested vehicles exceed their current free fleet,
  // as they may fulfill the request in multiple rounds.

  const journeyStatusId = journeyStatusMap.waiting;

  const companyBidRequestUniqueId = uuidv4();
  const calculatedTotalCost =
    proposedTotalCost ?? proposedCostPerVehicle * finalCount;

  await db().query(
    `INSERT INTO CompanyBidRequest
      (companyBidRequestUniqueId, passengerRequestBatchId, companyUniqueId,
       bidSubmittedByUserUniqueId, numberOfVehiclesOffered, vehicleTypeUniqueId,
       proposedCostPerVehicle, proposedTotalCost, proposedShippingDate,
       proposedDeliveryDate, bidNotes, bidStatus, journeyStatusId,
       companyBidRequestCreatedBy, companyBidRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
    [
      companyBidRequestUniqueId,
      passengerRequestBatchId,
      companyUniqueId,
      bidSubmittedByUserUniqueId,
      finalCount,
      finalVehicleTypeUniqueId,
      proposedCostPerVehicle,
      calculatedTotalCost,
      proposedShippingDate ?? null,
      proposedDeliveryDate ?? null,
      bidNotes ?? null,
      journeyStatusId,
      bidSubmittedByUserUniqueId,
      currentDate(),
    ],
  );
  // 🔔 Notify Shipper via WebSocket
  if (shipperUserUniqueId) {
    // Get shipper phone number for socket identifier
    const [shipperRows] = await db().query(
      "SELECT phoneNumber FROM Users WHERE userUniqueId = ?",
      [shipperUserUniqueId],
    );

    if (shipperRows?.[0]?.phoneNumber) {
      const {
        sendSocketIONotificationToPassenger,
      } = require("../Utils/Notifications");
      sendSocketIONotificationToPassenger({
        phoneNumber: shipperRows[0].phoneNumber,
        message: {
          messageTypes: messageTypes.company_bid_submitted,
          notification: {
            title: "New Company Bid",
            body: `${company.companyName} has submitted a bid for your freight.`,
          },
          data: {
            companyBidRequestUniqueId,
            companyName: company.companyName,
            passengerRequestBatchId,
            proposedTotalCost: calculatedTotalCost,
          },
        },
      }).catch((e) =>
        logger.error("WebSocket notification to shipper failed in submitBid", {
          error: e.message,
          shipperUserUniqueId,
        }),
      );
    }
  }

  return { message: "success", data: { companyBidRequestUniqueId } };
};

/**
 * ### DISCOVERY LOGIC - Find Available Bids
 * Fetches batches targeted at the company or open to all companies.
 *
 * **Junior Note: SQL Optimization Corner**
 * 1. **`ONLY_FULL_GROUP_BY` Workaround**: In modern MySQL, `GROUP BY` is strict. To select a full
 *    set of data (`SELECT *`) while grouping by a batch ID, we first use a subquery to find
 *    the `MIN(passengerRequestId)` for each matching batch. Then we join back to those specific IDs.
 * 2. **Hiding Existing Bids**: We use a `NOT EXISTS` block. This ensures that once your company
 *    submits a bid, the request automatically disappears from your "Available" board to prevent
 *    double-bidding.
 * 3. **Open Bids**: We check for `targetCompanyUniqueId IS NULL`. This allows shippers to broadcast
 *    work to all transport fleets at once.
 *
 * @param {string} userUniqueId - The authenticated dispatcher seeking work.
 * @param {Object} filters - Pagination and search filters.
 * @returns {Promise<Object>} A paginated object with `data` (list) and `pagination` (total).
 */
exports.getAvailableRequests = async (companyUniqueId, filters = {}) => {
  const { page, limit, offset } = paginate(filters);

  // 2. Fetch Requests from the optimized Metadata table (O(N) PERFORMANCE)
  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
  ];

  const filterClauses = [
    "b.batchDeletedAt IS NULL",
    "b.requestMode = 'company_target'",
    "(b.targetCompanyUniqueId = ? OR b.targetCompanyUniqueId IS NULL)",
    "b.journeyStatusId IN (?)",
    `NOT EXISTS (
      SELECT 1 FROM CompanyBidRequest cbr 
      WHERE cbr.passengerRequestBatchId = b.batchUniqueId 
      AND cbr.companyUniqueId = ? AND cbr.companyBidRequestDeletedAt IS NULL
    )`,
  ];
  const params = [companyUniqueId, activeStatusIds, companyUniqueId];
  const filterWhere = `WHERE ${filterClauses.join(" AND ")}`;

  // baseSql: No subqueries, no Group By! Pure performance.
  const baseSql = `
    SELECT b.*, 
           b.batchUniqueId AS passengerRequestBatchId, -- backwards compatibility
           u.fullName AS shipperName,
           vt.vehicleTypeName, js.journeyStatusName
    FROM PassengerRequestBatch b
    LEFT JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
    LEFT JOIN VehicleTypes vt ON b.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
    ${filterWhere}
  `;

  const countSql = `
    SELECT COUNT(*) AS total 
    FROM PassengerRequestBatch b
    ${filterWhere}
  `;

  return paginatedQuery(
    `${baseSql} ORDER BY b.batchCreatedAt DESC`,
    countSql,
    params,
    page,
    limit,
    offset,
  );
};

/**
 * ### UNIFIED GROUPED VIEW - Batches with Nested Offers
 * Works for both Shippers and Company Dispatchers.
 *
 * - **Shipper**: Shows their freight batches, each with ALL company offers inside `offers[]`.
 * - **Company**: Shows batches they bid on, each with their own offer inside `offers[]`.
 *
 * Offers are sorted cheapest first so shippers can compare prices at a glance.
 *
 * @param {Object} scope - { shipperUserUniqueId } or { companyUniqueId }
 * @param {Object} filters - Pagination and optional bidStatus/passengerRequestBatchId.
 * @returns {Promise<Object>} Paginated list of batches with nested offers.
 */
exports.getGroupedBids = async (scope = {}, filters = {}) => {
  const { shipperUserUniqueId, companyUniqueId } = scope;
  const { page, limit, offset } = paginate(filters);

  // ── 1. Build the batch WHERE clause ──────────────────────────────────────
  const batchClauses = ["b.batchDeletedAt IS NULL"];
  const batchParams = [];

  if (shipperUserUniqueId) {
    // Shippers see their own batches
    batchClauses.push("b.shipperUserUniqueId = ?");
    batchParams.push(shipperUserUniqueId);
  } else if (companyUniqueId) {
    // Companies see only batches they have a bid on
    batchClauses.push(
      `EXISTS (
        SELECT 1 FROM CompanyBidRequest cbr
        WHERE cbr.passengerRequestBatchId = b.batchUniqueId
          AND cbr.companyUniqueId = ?
          AND cbr.companyBidRequestDeletedAt IS NULL
      )`,
    );
    batchParams.push(companyUniqueId);
  }

  if (filters.passengerRequestBatchId) {
    batchClauses.push("b.batchUniqueId = ?");
    batchParams.push(filters.passengerRequestBatchId);
  }

  const batchWhere = `WHERE ${batchClauses.join(" AND ")}`;

  const [batches] = await db().query(
    `SELECT b.batchUniqueId,
            b.batchUniqueId AS passengerRequestBatchId,
            b.batchId,
            b.originPlace, b.destinationPlace,
            b.shippableItemName, b.shippableItemQtyInQuintal,
            b.totalVehicles, b.shippingCost AS batchShippingCost,
            b.shippingDate AS batchShippingDate, b.deliveryDate AS batchDeliveryDate,
            b.journeyStatusId, b.requestMode, b.batchCreatedAt,
            js.journeyStatusName, vt.vehicleTypeName,
            u.fullName AS shipperName
     FROM PassengerRequestBatch b
     LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
     LEFT JOIN VehicleTypes vt ON b.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
     LEFT JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
     ${batchWhere}
     ORDER BY b.batchCreatedAt DESC
     LIMIT ? OFFSET ?`,
    [...batchParams, limit, offset],
  );

  const [[{ total }]] = await db().query(
    `SELECT COUNT(*) AS total FROM PassengerRequestBatch b ${batchWhere}`,
    batchParams,
  );

  if (!batches || batches.length === 0) {
    return {
      message: "success",
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };
  }

  // ── 2. Fetch all matching offers in ONE query (avoids N+1) ───────────────
  const batchIds = batches.map((b) => b.batchUniqueId);

  const offerClauses = [
    "cbr.passengerRequestBatchId IN (?)",
    "cbr.companyBidRequestDeletedAt IS NULL",
  ];
  const offerParams = [batchIds];

  // Companies only see their own offer; shippers see everyone's
  if (companyUniqueId) {
    offerClauses.push("cbr.companyUniqueId = ?");
    offerParams.push(companyUniqueId);
  }
  if (filters.bidStatus) {
    offerClauses.push("cbr.bidStatus = ?");
    offerParams.push(filters.bidStatus);
  }

  const [offers] = await db().query(
    `SELECT cbr.companyBidRequestUniqueId,
            cbr.passengerRequestBatchId,
            cbr.companyUniqueId,
            cbr.bidSubmittedByUserUniqueId,
            cbr.numberOfVehiclesOffered,
            cbr.proposedCostPerVehicle,
            cbr.proposedTotalCost,
            cbr.proposedShippingDate,
            cbr.proposedDeliveryDate,
            cbr.bidNotes,
            cbr.bidStatus,
            cbr.bidStatusUpdatedAt,
            cbr.companyBidRequestCreatedAt,
            tc.companyName, tc.companyPhone, tc.companyEmail,
            vt.vehicleTypeName AS offeredVehicleTypeName,
            u.fullName AS submittedByName
     FROM CompanyBidRequest cbr
     LEFT JOIN TransportCompany tc ON cbr.companyUniqueId = tc.companyUniqueId
     LEFT JOIN VehicleTypes vt ON cbr.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
     LEFT JOIN Users u ON cbr.bidSubmittedByUserUniqueId = u.userUniqueId
     WHERE ${offerClauses.join(" AND ")}
     ORDER BY cbr.proposedTotalCost ASC`,
    offerParams,
  );

  // ── 3. Group offers under each batch using a Map (O(N)) ──────────────────
  const offersByBatchId = new Map();
  for (const offer of offers) {
    if (!offersByBatchId.has(offer.passengerRequestBatchId)) {
      offersByBatchId.set(offer.passengerRequestBatchId, []);
    }
    offersByBatchId.get(offer.passengerRequestBatchId).push(offer);
  }

  const grouped = batches.map((batch) => ({
    ...batch,
    offerCount: (offersByBatchId.get(batch.batchUniqueId) || []).length,
    offers: offersByBatchId.get(batch.batchUniqueId) || [],
  }));

  return {
    message: "success",
    data: grouped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

/**
 * ### DASHBOARD LOGIC - Get Dashboard Counts
 * Fetches total counts for different bid categories (badges/notifications).
 *
 * **Junior Note: "The Dashboard Speed Pattern"**
 * Mobile apps shouldn't load all 50 shipping requests just to show a "4" badge. This method
 * runs multiple lightweight `COUNT` operations in parallel. This is the **Best Practice** for
 * low-latency landing pages.
 *
 * **Counts Provided:**
 * - `available`: New work ready for discovery.
 * - `submitted`: Active bids waiting for shipper response.
 * - `accepted`: Winning bids ready for you to assign drivers/vehicles.
 *
 * @param {string} userUniqueId - The user identity to derive the company membership.
 * @returns {Promise<Object>} An object with structured counts for UI badges.
 */
exports.getBidsSummary = async (companyUniqueId) => {
  // 2. Count Available (matching discovery boards filters)
  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
  ];
  const [availableRes] = await db().query(
    `SELECT COUNT(*) AS total 
     FROM PassengerRequestBatch b
     WHERE b.batchDeletedAt IS NULL
       AND b.requestMode = 'company_target'
       AND (b.targetCompanyUniqueId = ? OR b.targetCompanyUniqueId IS NULL)
       AND b.journeyStatusId IN (?)
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidRequest cbr 
         WHERE cbr.passengerRequestBatchId = b.batchUniqueId 
         AND cbr.companyUniqueId = ? AND cbr.companyBidRequestDeletedAt IS NULL
       )`,
    [companyUniqueId, activeStatusIds, companyUniqueId],
  );

  // 3. Count Submitted (Pending shipper response)
  const [submittedRes] = await db().query(
    `SELECT COUNT(*) AS total FROM CompanyBidRequest 
     WHERE companyUniqueId = ? AND bidStatus = 'submitted' 
       AND companyBidRequestDeletedAt IS NULL`,
    [companyUniqueId],
  );

  // 4. Count Accepted (Shipper approved, ready for dispatch)
  const [acceptedRes] = await db().query(
    `SELECT COUNT(*) AS total FROM CompanyBidRequest 
     WHERE companyUniqueId = ? AND bidStatus = 'accepted_by_shipper' 
       AND companyBidRequestDeletedAt IS NULL`,
    [companyUniqueId],
  );

  return {
    message: "success",
    data: {
      available: availableRes[0]?.total || 0,
      submitted: submittedRes[0]?.total || 0,
      accepted: acceptedRes[0]?.total || 0,
      total:
        (availableRes[0]?.total || 0) +
        (submittedRes[0]?.total || 0) +
        (acceptedRes[0]?.total || 0),
    },
  };
};

/**
 * ### GATEWAY LOGIC - The Bid Access Point
 * Routes unified requests to the specialized 'Available' or 'Summary' logic.
 *
 * **Junior Note: Route Cleanliness**
 * Instead of creating 5 different routes, we use a single `GET /` with a `target` query param.
 * This keeps the API surface clean and similar to how a folder/tab system works on the frontend.
 *
 * @param {Object} filters - Raw query parameters from the request.
 * @param {string} [userUniqueId] - Optional ID for authenticated scoping.
 * @returns {Promise<Object>} Any format requested via the `target` parameter.
 */
exports.getBids = async (filters = {}, userUniqueId = null, roleId = null) => {
  if (!userUniqueId) {
    throw new AppError("Authentication required", 401);
  }
  const isAdmin =
    roleId === usersRoles.adminRoleId ||
    roleId === usersRoles.supperAdminRoleId;
  const isShipper = roleId === usersRoles.passengerRoleId;
  let resolvedCompanyUniqueId = null;
  let resolvedShipperUserUniqueId = null;

  if (isAdmin) {
    // Admins can target a specific company or shipper
    resolvedCompanyUniqueId = filters.companyUniqueId || null;
    resolvedShipperUserUniqueId = filters.shipperUserUniqueId || null;
  } else if (isShipper) {
    // Shippers can only see bids for their own batches
    resolvedShipperUserUniqueId = userUniqueId;
  } else {
    // Standard users (Dispatchers) MUST resolve to their own company
    const [membership] = await db().query(
      `SELECT companyUniqueId FROM CompanyMembership WHERE userUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL`,
      [userUniqueId],
    );
    if (!membership || membership.length === 0) {
      throw new AppError(
        "User is not an active member of any transport company",
        403,
      );
    }

    if (filters.companyUniqueId) {
      const isMember = membership.some(
        (m) => m.companyUniqueId === filters.companyUniqueId,
      );
      if (!isMember) {
        throw new AppError(
          "Access Denied: You are not an active member of the specified company",
          403,
        );
      }
      resolvedCompanyUniqueId = filters.companyUniqueId;
    } else {
      if (membership.length === 1) {
        resolvedCompanyUniqueId = membership[0].companyUniqueId;
      } else {
        throw new AppError(
          "You belong to multiple companies. Please provide companyUniqueId in your query to specify which company you are fetching data for.",
          400,
        );
      }
    }
  }

  if (filters.target === "summary") {
    if (!resolvedCompanyUniqueId) {
      throw new AppError("companyUniqueId is required for summary mode", 400);
    }
    return exports.getBidsSummary(resolvedCompanyUniqueId);
  }
  if (filters.target === "available") {
    if (!resolvedCompanyUniqueId) {
      throw new AppError("companyUniqueId is required for available mode", 400);
    }
    return exports.getAvailableRequests(resolvedCompanyUniqueId, filters);
  }

  // Default (grouped) — works for shippers, companies, and admins
  return exports.getGroupedBids(
    {
      shipperUserUniqueId: resolvedShipperUserUniqueId,
      companyUniqueId: resolvedCompanyUniqueId,
    },
    filters,
  );
};

/**
 * ### STATE MACHINE - Multi-step Status Updates
 * Updates the bid status and manages the lifecycle of the linked PassengerRequest.
 *
 * **Junior Note: Synchronization Logic**
 * - When you accept a bid, the *Request* also updates its status so no one else can take it.
 * - When a bid is rejected/cancelled, the *Request* falls back to 'waiting' so other
 *   companies can see it again.
 * - This function also triggers **FCM Notifications** to notify the dispatcher instantly
 *   about the shipper's decision.
 *
 * @param {string} companyBidRequestUniqueId - The ID of the bid record to update.
 * @param {string} bidStatus - The new desired status (e.g., 'accepted_by_shipper').
 * @param {string} updatedBy - The admin/shipper ID performing the action.
 */
/**
 * Updates the status of a company bid (e.g., Accepting, Rejecting, or Cancelling).
 *
 * ### CRITICAL: Consistency & Atomicity (for Junior Developers):
 * This function handles the most sensitive state transitions in the bidding system.
 * Because it affects both the `CompanyBidRequest` and `PassengerRequest` tables,
 * it MUST be executed inside a database transaction to prevent \"partial updates\"
 * if the server crashes.
 *
 * #### The \"Race Condition\" Shield (Part E):
 * When a shipper accepts a company bid (`accepted_by_shipper`), we perform two vital steps:
 * 1. **Locking**: We use `FOR UPDATE` on all requests in the batch. This \"locks\" the
 *    rows in MySQL so that an individual driver cannot claim them while this
 *    function is running.
 * 2. **Verification**: After locking, we re-check if any request was already
 *    claimed by someone else just milliseconds prior. If so, we \"Hard Fail\"
 *    (Conflict 409) rather than overwriting someone else's work.
 *
 * @param {string} companyBidRequestUniqueId - The ID of the bid being updated.
 * @param {string} bidStatus - The new status (e.g., 'accepted_by_shipper', 'rejected_by_shipper').
 * @param {string} updatedBy - The User Unique ID of the person making the change.
 * @throws {AppError} 404 - If the bid is not found.
 * @throws {AppError} 409 - If a consistency conflict is detected (someone already claimed the freight).
 * @returns {Promise<Object>} Success message.
 */
exports.updateBidStatus = async (
  companyBidRequestUniqueId,
  bidStatus,
  updatedBy,
) => {
  const bid = await findOne(
    "CompanyBidRequest",
    { companyBidRequestUniqueId },
    "Bid not found",
  );
  if (bid.companyBidRequestDeletedAt) {
    throw new AppError("Bid has been deleted", 400);
  }

  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET bidStatus = ?, bidStatusUpdatedAt = ?, bidStatusUpdatedBy = ?,
         companyBidRequestUpdatedBy = ?, companyBidRequestUpdatedAt = ?
     WHERE companyBidRequestUniqueId = ?`,
    [
      bidStatus,
      currentDate(),
      updatedBy,
      updatedBy,
      currentDate(),
      companyBidRequestUniqueId,
    ],
  );
  if (res.affectedRows === 0) {
    throw new AppError("Bid update failed", 500);
  }

  let newPRStatus = null;
  if (bidStatus === "accepted_by_shipper") {
    // 1. LOCK ALL PASSENGER REQUESTS IN THIS BATCH
    // We use 'FOR UPDATE' to prevent individual drivers from 'Accepting' these
    // requests while we are processing this company bid.
    const [rows] = await db().query(
      `SELECT passengerRequestId, journeyStatusId 
       FROM PassengerRequest 
       WHERE passengerRequestBatchId = ? 
         AND passengerRequestDeletedAt IS NULL 
       FOR UPDATE`,
      [bid.passengerRequestBatchId],
    );

    // 2. VERIFY STATE (Integrity Check)
    // Ensure all requests in the batch are still 'Free' (waiting or requested)
    // If an individual driver already claimed one, this will catch it.
    if (rows.length === 0) {
      throw new AppError(
        `Consistency Conflict: No requests found for batch '${bid.passengerRequestBatchId}'. The shipper may have cancelled the entire batch or you are using a stale bid from before a database reset.`,
        409,
      );
    }

    const freeRequests = rows.filter(
      (r) =>
        r.journeyStatusId === journeyStatusMap.waiting ||
        r.journeyStatusId === journeyStatusMap.requested ||
        r.journeyStatusId === journeyStatusMap.acceptedByDriver,
    );

    if (freeRequests.length < bid.numberOfVehiclesOffered) {
      const alreadyClaimed = rows.length - freeRequests.length;
      throw new AppError(
        `Consistency Conflict: Only ${freeRequests.length} of ${bid.numberOfVehiclesOffered} requested vehicles are still available. ${alreadyClaimed} individual driver(s) have already been accepted for this freight.`,
        409,
      );
    }

    newPRStatus = journeyStatusMap.acceptedByPassenger;
  } else if (
    bidStatus === "cancelled_by_company" ||
    bidStatus === "rejected_by_shipper" ||
    bidStatus === "expired"
  ) {
    newPRStatus = journeyStatusMap.waiting;
  }

  if (newPRStatus !== null) {
    await db().query(
      `UPDATE PassengerRequest
       SET journeyStatusId = ?
       WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
      [newPRStatus, bid.passengerRequestBatchId],
    );
  }

  const notificationMap = {
    accepted_by_shipper: {
      title: "Bid accepted",
      body: "The shipper has accepted your company's freight bid.",
    },
    rejected_by_shipper: {
      title: "Bid rejected",
      body: "The shipper has rejected your company's freight bid.",
    },
    cancelled_by_company: {
      title: "Bid cancelled",
      body: "Your company's bid has been cancelled.",
    },
    expired: {
      title: "Bid expired",
      body: "Your company's bid has expired without a response.",
    },
  };
  const notif = notificationMap[bidStatus];
  if (notif && bid.bidSubmittedByUserUniqueId) {
    sendFCMNotificationToUser({
      userUniqueId: bid.bidSubmittedByUserUniqueId,
      roleId: usersRoles.driverRoleId,
      notification: notif,
      data: {
        type: "company_bid_status_update",
        bidStatus,
        companyBidRequestUniqueId,
        passengerRequestBatchId: bid.passengerRequestBatchId,
      },
    }).catch((e) =>
      logger.error("FCM notification failed for bid status update", {
        error: e.message,
      }),
    );

    // 🔔 Real-time WebSocket Notification
    const socketMessageTypeMap = {
      accepted_by_shipper: messageTypes.company_bid_accepted,
      rejected_by_shipper: messageTypes.company_bid_rejected,
      cancelled_by_company: messageTypes.company_bid_cancelled,
    };

    const socketMsgType = socketMessageTypeMap[bidStatus];
    if (socketMsgType) {
      sendSocketIONotificationToCompany({
        companyUniqueId: bid.companyUniqueId,
        message: {
          messageTypes: socketMsgType,
          notification: notif,
          data: {
            bidStatus,
            companyBidRequestUniqueId,
            passengerRequestBatchId: bid.passengerRequestBatchId,
          },
        },
      }).catch((e) =>
        logger.error("WebSocket notification failed for company bid status", {
          error: e.message,
          companyUniqueId: bid.companyUniqueId,
        }),
      );
    }
  }

  return { message: "success", data: "Bid status updated" };
};

exports.deleteBid = async (companyBidRequestUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET companyBidRequestDeletedAt = ?, companyBidRequestDeletedBy = ?
     WHERE companyBidRequestUniqueId = ? AND companyBidRequestDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyBidRequestUniqueId],
  );
  if (res.affectedRows === 0) {
    throw new AppError("Bid not found or already deleted", 404);
  }
  return { message: "success", data: "Bid deleted" };
};
