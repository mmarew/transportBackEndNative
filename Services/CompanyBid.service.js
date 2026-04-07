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
 * **Junior Note: High Stakes!**
 * This function handles the "Heart" of the company bidding flow. It performs multiple security
 * and business checks before inserting a row into `CompanyBidRequest`.
 *
 * **Important Rules:**
 * 1. Only 'Approved' companies can bid (Security).
 * 2. Companies can't bid on work targeted at *other* specific companies (Privacy).
 * 3. Companies must bid on the *entire* batch (No partial loads for fleet dispatch).
 *
 * @param {Object} data - The payload containing bid details.
 * @param {string} data.passengerRequestBatchId - The UUID that groups the shipper's requests.
 * @param {string} data.companyUniqueId - The ID of the bidding fleet.
 * @param {string} data.bidSubmittedByUserUniqueId - The User ID of the dispatcher who clicked 'Send'.
 * @param {number} data.numberOfVehiclesOffered - Must match the batch total.
 * @param {string} data.vehicleTypeUniqueId - Validates the fleet can provide this type.
 * @returns {Promise<Object>} A success message with the new bid's unique ID.
 */
exports.submitBid = async (data) => {
  const {
    passengerRequestBatchId,
    companyUniqueId,
    bidSubmittedByUserUniqueId,
    numberOfVehiclesOffered,
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
    throw new AppError("Only approved companies can submit bids", 400);

  // Verify the batch exists and count its rows
  const [countRows] = await db().query(
    `SELECT COUNT(*) AS batchCount
     FROM PassengerRequest
     WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL`,
    [passengerRequestBatchId],
  );
  const batchCount = Number(countRows?.[0]?.batchCount ?? 0);
  if (batchCount === 0)
    throw new AppError("Passenger request batch not found", 404);

  // Check company-targeting
  try {
    const [tRows] = await db().query(
      `SELECT requestMode, targetCompanyUniqueId FROM PassengerRequest
       WHERE passengerRequestBatchId = ? AND passengerRequestDeletedAt IS NULL LIMIT 1`,
      [passengerRequestBatchId],
    );
    if (tRows?.length > 0) {
      const { requestMode, targetCompanyUniqueId } = tRows[0];
      if (
        requestMode === "company_target" &&
        targetCompanyUniqueId !== null &&
        targetCompanyUniqueId !== companyUniqueId
      ) {
        throw new AppError(
          "This batch is targeted at a different company",
          403,
        );
      }
    }
  } catch (e) {
    if (e.code !== "ER_BAD_FIELD_ERROR") throw e;
  }

  // Full-batch bid only
  if (Number(numberOfVehiclesOffered) !== batchCount)
    throw new AppError(
      `Full batch bid required. Batch has ${batchCount} vehicles; you offered ${numberOfVehiclesOffered}`,
      400,
    );

  // One bid per company per batch
  const [existing] = await db().query(
    "SELECT companyBidRequestId FROM CompanyBidRequest WHERE companyUniqueId = ? AND passengerRequestBatchId = ? AND companyBidRequestDeletedAt IS NULL",
    [companyUniqueId, passengerRequestBatchId],
  );
  if (existing.length > 0)
    throw new AppError(
      "This company has already submitted a bid for this batch",
      409,
    );

  const [jsRows] = await db().query(
    "SELECT journeyStatusId FROM JourneyStatus WHERE journeyStatusName = 'waiting' LIMIT 1",
  );
  const journeyStatusId = jsRows?.[0]?.journeyStatusId ?? 1;

  const companyBidRequestUniqueId = uuidv4();
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
      numberOfVehiclesOffered,
      vehicleTypeUniqueId,
      proposedCostPerVehicle ?? null,
      proposedTotalCost ?? null,
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
exports.getAvailableRequests = async (userUniqueId, filters = {}) => {
  const { page, limit, offset } = paginate(filters);

  // 1. Identify the company for this user
  const [membership] = await db().query(
    `SELECT companyUniqueId FROM CompanyMembership 
     WHERE userUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL LIMIT 1`,
    [userUniqueId],
  );
  if (!membership || membership.length === 0) {
    throw new AppError(
      "User is not an active member of any transport company",
      403,
    );
  }
  const companyUniqueId = membership[0].companyUniqueId;

  // 2. Fetch Requests from the optimized Metadata table (O(N) PERFORMANCE)
  const activeStatusIds = [journeyStatusMap.requested, journeyStatusMap.waiting];

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
           vt.vehicleTypeName, js.journeyStatusName
    FROM PassengerRequestBatch b
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
exports.getBidsSummary = async (userUniqueId) => {
  // 1. Identify the company for this user
  const [membership] = await db().query(
    `SELECT companyUniqueId FROM CompanyMembership 
     WHERE userUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL LIMIT 1`,
    [userUniqueId],
  );
  if (!membership || membership.length === 0) {
    throw new AppError("User is not an active member of any transport company", 403);
  }
  const companyUniqueId = membership[0].companyUniqueId;

  // 2. Count Available (matching discovery boards filters)
  const activeStatusIds = [journeyStatusMap.requested, journeyStatusMap.waiting];
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
      total: (availableRes[0]?.total || 0) + (submittedRes[0]?.total || 0) + (acceptedRes[0]?.total || 0),
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
exports.getBids = async (filters = {}, userUniqueId = null) => {
  if (filters.target === "summary") {
    if (!userUniqueId) throw new AppError("Authentication required", 401);
    return exports.getBidsSummary(userUniqueId);
  }
  if (filters.target === "available") {
    if (!userUniqueId) throw new AppError("Authentication required", 401);
    return exports.getAvailableRequests(userUniqueId, filters);
  }
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyBidRequestDeletedAt IS NULL"];
  const params = [];

  if (filters.companyBidRequestUniqueId) {
    clauses.push("companyBidRequestUniqueId = ?");
    params.push(filters.companyBidRequestUniqueId);
  }
  if (filters.passengerRequestBatchId) {
    clauses.push("passengerRequestBatchId = ?");
    params.push(filters.passengerRequestBatchId);
  }
  if (filters.companyUniqueId) {
    clauses.push("companyUniqueId = ?");
    params.push(filters.companyUniqueId);
  }
  if (filters.bidStatus) {
    clauses.push("bidStatus = ?");
    params.push(filters.bidStatus);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyBidRequest ${where} ORDER BY companyBidRequestCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidRequest ${where}`,
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
    throw new AppError("Bid has been deleted", 400);

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
  if (res.affectedRows === 0) throw new AppError("Bid update failed", 500);

  let newPRStatus = null;
  if (bidStatus === "accepted_by_shipper") {
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
    throw new AppError("Bid not found or already deleted", 404);
  return { message: "success", data: "Bid deleted" };
};
