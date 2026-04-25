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
  if (company.approvalStatus !== "approved")
  {throw new AppError("Only approved companies can submit bids", 400);}

  // 1. Verify the batch exists and get its metadata
  const [batchRows] = await db().query(
    `SELECT totalVehicles, vehicleTypeUniqueId, requestMode, targetCompanyUniqueId 
     FROM PassengerRequestBatch 
     WHERE batchUniqueId = ? AND batchDeletedAt IS NULL LIMIT 1`,
    [passengerRequestBatchId],
  );
  if (!batchRows || batchRows.length === 0)
  {throw new AppError("Passenger request batch not found", 404);}

  const { totalVehicles, requestMode, targetCompanyUniqueId } = batchRows[0];

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
  if (actualRequestCount === 0)
  {throw new AppError("This batch contains no individual requests", 400);}

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
  if (existing.length > 0)
  {throw new AppError(
    "This company has already submitted a bid for this batch",
    409,
  );}

  // --- NEW: CAPACITY VALIDATION ---
  // Ensure the company has enough trucks available in their fleet to fulfill this bid
  // if they win it.
  await validateFleetCapacity(companyUniqueId, finalCount);

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
  if (!userUniqueId) {throw new AppError("Authentication required", 401);}

  const isAdmin =
    roleId === usersRoles.adminRoleId ||
    roleId === usersRoles.supperAdminRoleId;

  let resolvedCompanyUniqueId = null;

  if (isAdmin) {
    // Admins can target a specific company by passing it in the query, else null (to get all if listing)
    resolvedCompanyUniqueId = filters.companyUniqueId || null;
  } else {
    // Standard users MUST resolve to their own company
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
    if (!resolvedCompanyUniqueId)
    {throw new AppError("companyUniqueId is required for summary mode", 400);}
    return exports.getBidsSummary(resolvedCompanyUniqueId);
  }
  if (filters.target === "available") {
    if (!resolvedCompanyUniqueId)
    {throw new AppError("companyUniqueId is required for available mode", 400);}
    return exports.getAvailableRequests(resolvedCompanyUniqueId, filters);
  }

  const { page, limit, offset } = paginate(filters);
  const clauses = ["cbr.companyBidRequestDeletedAt IS NULL"];
  const params = [];

  if (filters.companyBidRequestUniqueId) {
    clauses.push("cbr.companyBidRequestUniqueId = ?");
    params.push(filters.companyBidRequestUniqueId);
  }
  if (filters.passengerRequestBatchId) {
    clauses.push("cbr.passengerRequestBatchId = ?");
    params.push(filters.passengerRequestBatchId);
  }

  if (resolvedCompanyUniqueId) {
    clauses.push("cbr.companyUniqueId = ?");
    params.push(resolvedCompanyUniqueId);
  }
  if (filters.bidStatus) {
    clauses.push("cbr.bidStatus = ?");
    params.push(filters.bidStatus);
  }
  if (filters.bidSubmittedByUserUniqueId) {
    clauses.push("cbr.bidSubmittedByUserUniqueId = ?");
    params.push(filters.bidSubmittedByUserUniqueId);
  }
  if (filters.numberOfVehiclesOffered) {
    clauses.push("cbr.numberOfVehiclesOffered = ?");
    params.push(filters.numberOfVehiclesOffered);
  }
  if (filters.vehicleTypeUniqueId) {
    clauses.push("cbr.vehicleTypeUniqueId = ?");
    params.push(filters.vehicleTypeUniqueId);
  }
  if (filters.journeyStatusId) {
    clauses.push("cbr.journeyStatusId = ?");
    params.push(filters.journeyStatusId);
  }
  if (filters.journeyStatusName) {
    clauses.push("js.journeyStatusName = ?");
    // Since we are referencing 'js', the query joins cleanly.
    params.push(filters.journeyStatusName);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  const joinSql = `
    LEFT JOIN TransportCompany tc ON cbr.companyUniqueId = tc.companyUniqueId
    LEFT JOIN VehicleTypes vt ON cbr.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    LEFT JOIN JourneyStatus js ON cbr.journeyStatusId = js.journeyStatusId
    LEFT JOIN PassengerRequestBatch prb ON cbr.passengerRequestBatchId = prb.batchUniqueId
    LEFT JOIN Users u ON prb.shipperUserUniqueId = u.userUniqueId
  `;

  const baseSql = `
    SELECT cbr.*, 
           tc.companyName, tc.companyPhone, tc.companyEmail,
           vt.vehicleTypeName, js.journeyStatusName,
           u.fullName AS shipperName, u.phoneNumber AS shipperPhone, u.email AS shipperEmail,
           prb.totalVehicles, prb.requestMode, prb.batchCreatedAt,
           prb.originPlace, prb.destinationPlace, prb.shippableItemName,
           prb.shippableItemQtyInQuintal, prb.shippingDate AS batchShippingDate,
           prb.deliveryDate AS batchDeliveryDate, prb.shippingCost AS batchShippingCost
    FROM CompanyBidRequest cbr
    ${joinSql}
    ${where}
  `;

  return paginatedQuery(
    `${baseSql} ORDER BY cbr.companyBidRequestCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidRequest cbr ${joinSql} ${where}`,
    params,
    page,
    limit,
    offset,
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
 * it MUST be executed inside a database transaction to prevent "partial updates"
 * if the server crashes.
 *
 * #### The "Race Condition" Shield (Part E):
 * When a shipper accepts a company bid (`accepted_by_shipper`), we perform two vital steps:
 * 1. **Locking**: We use `FOR UPDATE` on all requests in the batch. This "locks" the
 *    rows in MySQL so that an individual driver cannot claim them while this
 *    function is running.
 * 2. **Verification**: After locking, we re-check if any request was already
 *    claimed by someone else just milliseconds prior. If so, we "Hard Fail"
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
  if (bid.companyBidRequestDeletedAt)
  {throw new AppError("Bid has been deleted", 400);}

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
  if (res.affectedRows === 0) {throw new AppError("Bid update failed", 500);}

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
        type: "company_bid_status",
        bidStatus,
        companyBidRequestUniqueId,
        passengerRequestBatchId: bid.passengerRequestBatchId,
      },
    }).catch((e) =>
      logger.error("FCM notification failed for bid status update", {
        error: e.message,
        companyBidRequestUniqueId,
        bidStatus,
      }),
    );
  }

  return { message: "success", data: `Bid status updated to ${bidStatus}` };
};

exports.deleteBid = async (companyBidRequestUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyBidRequest
     SET companyBidRequestDeletedAt = ?, companyBidRequestDeletedBy = ?
     WHERE companyBidRequestUniqueId = ? AND companyBidRequestDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyBidRequestUniqueId],
  );
  if (res.affectedRows === 0)
  {throw new AppError("Bid not found or already deleted", 404);}
  return { message: "success", data: "Bid deleted" };
};
/**
 * Validates if a transport company has enough available vehicles to submit a new bid.
 *
 * ### How it works (for Junior Developers):
 * To prevent a company from promising more trucks than they actually have, we perform a
 * "Live Capacity Check" before every bid.
 *
 * 1. **Count Total Fleet**: We query the `CompanyVehicle` table for all active, non-deleted
 *    vehicles currently assigned to this company.
 * 2. **Count Reserved Capacity**: We look at the `CompanyBidRequest` table for all active
 *    bids that haven't finished yet.
 *    - A bid is "Active" if its status is 'submitted' (waiting for shipper) or 'accepted_by_shipper'.
 *    - A bid is "Finished" once the journey reaches 'journeyCompleted' (Status ID 6),
 *      at which point the truck is free again.
 * 3. **Calculation**: `Available = Total Fleet - Already Reserved`.
 * 4. **Block**: If the `requestedCount` for the new bid is greater than `Available`,
 *    we throw an error to block the submission.
 *
 * @param {string} companyUniqueId - The unique identifier of the transport company.
 * @param {number} requestedCount - The number of vehicles the company is offering for this specific bid.
 * @throws {AppError} 400 - If the company has no vehicles or lacks sufficient available capacity.
 * @returns {Promise<void>} - Resolves if validation passes, otherwise throws an error.
 */
async function validateFleetCapacity(companyUniqueId, requestedCount) {
  // 1. Get total active fleet size from our records
  const [fleetRows] = await db().query(
    `SELECT COUNT(*) AS fleetSize FROM CompanyVehicle 
     WHERE companyUniqueId = ? AND assignmentStatus = 'active' AND companyVehicleDeletedAt IS NULL`,
    [companyUniqueId],
  );

  const fleetSize = Number(fleetRows?.[0]?.fleetSize ?? 0);

  // Rule: If you don't have vehicles registered, you can't bid on anything.
  if (fleetSize === 0) {
    throw new AppError(
      "Your company has no active vehicles in its fleet. Please register vehicles before bidding.",
      400,
    );
  }

  // 2. Calculate how many trucks are already 'busy' or 'promised' to other shippers.
  // We sum 'numberOfVehiclesOffered' for all bids that are still in progress.
  const [reservedRows] = await db().query(
    `SELECT SUM(numberOfVehiclesOffered) AS reserved
     FROM CompanyBidRequest
     WHERE companyUniqueId = ? 
       AND bidStatus IN ('submitted', 'accepted_by_shipper')
       AND journeyStatusId < ? 
       AND companyBidRequestDeletedAt IS NULL`,
    [companyUniqueId, journeyStatusMap.journeyCompleted],
  );

  const reserved = Number(reservedRows?.[0]?.reserved ?? 0);

  // 3. Simple math to find the current 'Free' capacity
  const available = fleetSize - reserved;

  // 4. Final Check: Does the company have enough free trucks for this new request?
  if (requestedCount > available) {
    throw new AppError(
      `Fleet capacity exceeded. 
       Total Trucks: ${fleetSize}
       Currently Busy: ${reserved}
       Available Now: ${available}
       Requested for this bid: ${requestedCount}
       
       Please wait for current journeys to complete before bidding again.`,
      400,
    );
  }
}
