"use strict";

const { v4: } = require("uuid");

const AppError = require("../../Utils/AppError");
const {
  db,
  
  paginate,
  paginatedQuery} = require("../CompanyHelper.service");





const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");

/**
 * ### DISCOVERY LOGIC - Find Available Bids
 * Fetches batches targeted at the company or open to all companies.
 *
 * **Junior Note: SQL Optimization Corner**
 * 1. **`ONLY_FULL_GROUP_BY` Workaround**: In modern MySQL, `GROUP BY` is strict. To select a full
 *    set of data (`SELECT *`) while grouping by a batch ID, we first use a subquery to find
 *    the `MIN(shipperRequestId)` for each matching batch. Then we join back to those specific IDs.
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
const getAvailableRequests = async (companyUniqueId, filters = {}) => {
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
      WHERE cbr.shipperRequestBatchId = b.batchUniqueId 
      AND cbr.companyUniqueId = ? AND cbr.companyBidRequestDeletedAt IS NULL
    )`,
  ];
  const params = [companyUniqueId, activeStatusIds, companyUniqueId];
  const filterWhere = `WHERE ${filterClauses.join(" AND ")}`;

  // baseSql: No subqueries, no Group By! Pure performance.
  const baseSql = `
    SELECT b.*, 
           b.batchUniqueId AS shipperRequestBatchId, -- backwards compatibility
           u.fullName AS shipperName,
           u.phoneNumber AS shipperPhone,
           vt.vehicleTypeName, js.journeyStatusName
    FROM ShipperRequestBatch b
    LEFT JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
    LEFT JOIN VehicleTypes vt ON b.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
    ${filterWhere}
  `;

  const countSql = `
    SELECT COUNT(*) AS total 
    FROM ShipperRequestBatch b
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
 * @param {Object} filters - Pagination and optional bidStatus/shipperRequestBatchId.
 * @returns {Promise<Object>} Paginated list of batches with nested offers.
 */

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
 * @param {Object} filters - Pagination and optional bidStatus/shipperRequestBatchId.
 * @returns {Promise<Object>} Paginated list of batches with nested offers.
 */
const getGroupedBids = async (scope = {}, filters = {}) => {
  const { shipperUserUniqueId, companyUniqueId } = scope;
  const { page, limit, offset } = paginate(filters);

  // ── 1. Build the batch WHERE clause ──────────────────────────────────────
  const batchClauses = ["b.batchDeletedAt IS NULL", "b.requestMode = 'company_target'"];
  const batchParams = [];

  if (shipperUserUniqueId) {
    // Shippers see their own batches.
    // When offer-level filters are provided, we add an EXISTS guard so that
    // batches with 0 matching offers are never returned — same pattern as
    // the company path below.
    batchClauses.push("b.shipperUserUniqueId = ?");
    batchParams.push(shipperUserUniqueId);

    if (filters.bidStatus || filters.isCancellationSeenByCompany) {
      const existsClauses = [
        "cbr.shipperRequestBatchId = b.batchUniqueId",
        "cbr.companyBidRequestDeletedAt IS NULL",
      ];

      if (filters.bidStatus) {
        existsClauses.push("cbr.bidStatus = ?");
        batchParams.push(filters.bidStatus);
      }
      if (filters.isCancellationSeenByCompany) {
        existsClauses.push("cbr.isCancellationSeenByCompany = ?");
        batchParams.push(filters.isCancellationSeenByCompany);
      }

      batchClauses.push(
        `EXISTS (
          SELECT 1 FROM CompanyBidRequest cbr
          WHERE ${existsClauses.join(" AND ")}
        )`,
      );
    }
  } else if (companyUniqueId) {
    // Companies see only batches they have a matching bid on.
    // The EXISTS subquery mirrors the same filters applied to offers (Step 2)
    // so that batches with 0 matching offers are never returned.
    const existsClauses = [
      "cbr.shipperRequestBatchId = b.batchUniqueId",
      "cbr.companyUniqueId = ?",
      "cbr.companyBidRequestDeletedAt IS NULL",
    ];
    batchParams.push(companyUniqueId);

    if (filters.bidStatus) {
      existsClauses.push("cbr.bidStatus = ?");
      batchParams.push(filters.bidStatus);
    }
    if (filters.isCancellationSeenByCompany) {
      existsClauses.push("cbr.isCancellationSeenByCompany = ?");
      batchParams.push(filters.isCancellationSeenByCompany);
    }

    batchClauses.push(
      `EXISTS (
        SELECT 1 FROM CompanyBidRequest cbr
        WHERE ${existsClauses.join(" AND ")}
      )`,
    );
  }

  if (filters.shipperRequestBatchId) {
    batchClauses.push("b.batchUniqueId = ?");
    batchParams.push(filters.shipperRequestBatchId);
  }

  const batchWhere = `WHERE ${batchClauses.join(" AND ")}`;

  const [batches] = await db().query(
    `SELECT b.batchUniqueId,
            b.batchUniqueId AS shipperRequestBatchId,
            b.batchId,
            b.originPlace, b.destinationPlace,
            b.shippableItemName, b.shippableItemQtyInQuintal,
            b.totalVehicles, b.shippingCost AS batchShippingCost,
            b.shippingDate AS batchShippingDate, b.deliveryDate AS batchDeliveryDate,
            b.journeyStatusId, b.requestMode, b.batchCreatedAt,
            js.journeyStatusName, vt.vehicleTypeName,
            u.fullName AS shipperName
     FROM ShipperRequestBatch b
     LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
     LEFT JOIN VehicleTypes vt ON b.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
     LEFT JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
     ${batchWhere}
     ORDER BY b.batchCreatedAt DESC
     LIMIT ? OFFSET ?`,
    [...batchParams, limit, offset],
  );

  const [[{ total }]] = await db().query(
    `SELECT COUNT(*) AS total FROM ShipperRequestBatch b ${batchWhere}`,
    batchParams,
  );

  if (!batches || batches.length === 0) {
    return {
      message: "success",
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 }};
  }

  // ── 2. Fetch all matching offers in ONE query (avoids N+1) ───────────────
  const batchIds = batches.map((b) => b.batchUniqueId);

  const offerClauses = [
    "cbr.shipperRequestBatchId IN (?)",
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
  if (filters.isCancellationSeenByCompany) {
    offerClauses.push("cbr.isCancellationSeenByCompany = ?");
    offerParams.push(filters.isCancellationSeenByCompany);
  }

  const [offers] = await db().query(
    `SELECT cbr.companyBidRequestUniqueId,
            cbr.shipperRequestBatchId,
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
            cbr.isCancellationSeenByCompany,
            cbr.companyBidRequestCreatedAt,
            tc.companyName, tc.companyPhone, tc.companyEmail,
            vt.vehicleTypeName AS offeredVehicleTypeName,
            u.fullName AS submittedByName,
            (SELECT COUNT(*) FROM CompanyVehicle cv
             WHERE cv.companyUniqueId = cbr.companyUniqueId
               AND cv.assignmentStatus = 'active'
               AND cv.companyVehicleDeletedAt IS NULL
            ) AS companyFleetSize
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
    if (!offersByBatchId.has(offer.shipperRequestBatchId)) {
      offersByBatchId.set(offer.shipperRequestBatchId, []);
    }
    offersByBatchId.get(offer.shipperRequestBatchId).push(offer);
  }

  const grouped = batches.map((batch) => ({
    ...batch,
    offerCount: (offersByBatchId.get(batch.batchUniqueId) || []).length,
    offers: offersByBatchId.get(batch.batchUniqueId) || []}));

  return {
    message: "success",
    data: grouped,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)}};
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
const getBidsSummary = async (companyUniqueId) => {
  if (!companyUniqueId) {
    throw new AppError("companyUniqueId is required", 400);
  }
  // 2. Count Available (matching discovery boards filters)
  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
  ];
  const [availableRes] = await db().query(
    `SELECT COUNT(*) AS total 
     FROM ShipperRequestBatch b
     WHERE b.batchDeletedAt IS NULL
       AND b.requestMode = 'company_target'
       AND (b.targetCompanyUniqueId = ? OR b.targetCompanyUniqueId IS NULL)
       AND b.journeyStatusId IN (?)
       AND NOT EXISTS (
         SELECT 1 FROM CompanyBidRequest cbr 
         WHERE cbr.shipperRequestBatchId = b.batchUniqueId 
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
        (acceptedRes[0]?.total || 0)}};
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
const getBids = async (filters = {}, userUniqueId = null, roleId = null) => {
  if (!userUniqueId) {
    throw new AppError("Authentication required", 401);
  }
  const isAdmin =
    roleId === usersRoles.adminRoleId ||
    roleId === usersRoles.supperAdminRoleId;
  const isShipper = roleId === usersRoles.shipperRoleId;
  const isCompanyAdmin =
    roleId === usersRoles.companyAdminRoleId ||
    roleId === usersRoles.companyDispatchRoleId;
  let resolvedCompanyUniqueId = null;
  let resolvedShipperUserUniqueId = null;

  if (isAdmin) {
    // Admins can target a specific company or shipper
    resolvedCompanyUniqueId = filters.companyUniqueId || null;
    resolvedShipperUserUniqueId = filters.shipperUserUniqueId || null;
  } else if (isShipper) {
    // Shippers can only see bids for their own batches
    resolvedShipperUserUniqueId = userUniqueId;
  } else if (isCompanyAdmin) {
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
    //if filters.companyUniqueId is provided, check if the user is a member of that company
    if (filters?.companyUniqueId) {
      const isMember = membership.some(
        (m) => m?.companyUniqueId === filters?.companyUniqueId,
      );
      if (!isMember) {
        throw new AppError(
          "Access Denied: You are not an active member of the specified company",
          403,
        );
      }
      resolvedCompanyUniqueId = filters?.companyUniqueId;
    } else {
      //if filters.companyUniqueId is not provided, check if the user is a member of only one company
      if (membership?.length === 1) {
        resolvedCompanyUniqueId = membership?.[0]?.companyUniqueId;
      } else {
        //if the user is a member of multiple companies, throw an error
        throw new AppError(
          "You belong to multiple companies. Please provide companyUniqueId in your query to specify which company you are fetching data for.",
          400,
        );
      }
    }
  }
  //get all company bids for the resolved companyUniqueId

  if (filters?.target === "summary") {
    if (!resolvedCompanyUniqueId) {
      throw new AppError("companyUniqueId is required for summary mode", 400);
    }
    return getBidsSummary(resolvedCompanyUniqueId);
  }
  // if filters.target is available, get available requests, get biddable requests only when target is company and
  if (filters?.target === "available") {
    if (!resolvedCompanyUniqueId) {
      throw new AppError("companyUniqueId is required for available mode", 400);
    }
    return getAvailableRequests(resolvedCompanyUniqueId, filters);
  }

  // Default (grouped) — works for shippers, companies, and admins
  return getGroupedBids(
    {
      shipperUserUniqueId: resolvedShipperUserUniqueId,
      companyUniqueId: resolvedCompanyUniqueId},
    filters,
  );
};

/**
 * ### STATE MACHINE - Multi-step Status Updates
 * Updates the bid status and manages the lifecycle of the linked ShipperRequest.
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
 * Because it affects both the `CompanyBidRequest` and `ShipperRequest` tables,
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
module.exports = {
  getAvailableRequests,
  getGroupedBids,
  getBidsSummary,
  getBids
};
