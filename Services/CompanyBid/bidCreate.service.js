"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("../CompanyHelper.service");
const logger = require("../../Utils/logger");
const {
  reportCompanyCommissionEvasion,
} = require("../CommissionEvasion.service");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSocketIONotificationToCompany } = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");

/**
 * ### CORE LOGIC - Submit a Freight Bid
 * Processes a transport company's bid for a shipper's request batch.
 *
 * **Junior Note: Source of Truth Pattern**
 * To ensure data integrity, this function automatically fetches the vehicle type and
 * vehicle count from the `ShipperRequestBatch` table. This prevents the frontend
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
 * @param {string} data.shipperRequestBatchId - The UUID that groups the shipper's requests.
 * @param {string} data.companyUniqueId - The ID of the bidding fleet.
 * @param {string} data.bidSubmittedByUserUniqueId - The User ID of the dispatcher.
 * @param {number} [data.numberOfVehiclesOffered] - Optional; defaults to batch total.
 * @param {string} [data.vehicleTypeUniqueId] - Optional; defaults to batch requirement.
 * @returns {Promise<Object>} Success message.
 */
const submitBid = async (data) => {
  const {
    shipperRequestBatchId,
    companyUniqueId,
    bidSubmittedByUserUniqueId,
    vehicleTypeUniqueId,
    proposedCostPerVehicle,
    proposedTotalCost,
    proposedShippingDate,
    proposedDeliveryDate,
    bidNotes,
  } = data;

  // Company must be approved (registration-level check)
  const company = await findOne(
    "TransportCompany",
    { companyUniqueId, isDeleted: 0 },
    "Company not found",
  );
  if (company.approvalStatus !== "approved") {
    throw new AppError(
      `Company is not eligible to bid. Registration status: ${company.approvalStatus}`,
      400,
    );
  }

  // Company must not have an active ban (compliance-level check)
  // CompanyBan is the single source of truth for ban history — approvalStatus is never modified by bans.
  const [[activeBan]] = await db().query(
    `SELECT companyBanUniqueId, banReason, banExpiresAt
     FROM CompanyBan
     WHERE companyUniqueId = ? AND isActive = TRUE AND banExpiresAt > NOW()
     LIMIT 1`,
    [companyUniqueId],
  );
  if (activeBan) {
    const expiresOn = new Date(activeBan.banExpiresAt)
      .toISOString()
      .slice(0, 10);
    throw new AppError(
      `Company is currently suspended from bidding until ${expiresOn}. Reason: ${activeBan.banReason}`,
      403,
    );
  }

  // 1. Verify the batch exists and get its metadata
  const [batchRows] = await db().query(
    `SELECT totalVehicles, vehicleTypeUniqueId, requestMode, targetCompanyUniqueId, shipperUserUniqueId 
     FROM ShipperRequestBatch 
     WHERE batchUniqueId = ? AND batchDeletedAt IS NULL LIMIT 1`,
    [shipperRequestBatchId],
  );
  if (!batchRows || batchRows.length === 0) {
    throw new AppError("Shipper request batch not found", 404);
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

  // 2b. Reject new bids if a bid has already been accepted for this batch.
  //     Once the shipper selects a winner, the bidding window closes.
  const [acceptedBids] = await db().query(
    `SELECT companyBidRequestUniqueId, companyUniqueId
     FROM CompanyBidRequest
     WHERE shipperRequestBatchId = ?
       AND bidStatus = 'accepted_by_shipper'
       AND companyBidRequestDeletedAt IS NULL
     LIMIT 1`,
    [shipperRequestBatchId],
  );
  if (acceptedBids.length > 0) {
    throw new AppError(
      "Bidding is closed for this batch — a bid has already been accepted by the shipper",
      409,
    );
  }

  // 3. Verify the batch has actual requests — only relevant for individual_target batches.
  //    company_target batches intentionally have zero ShipperRequest rows at bid time;
  //    rows are bulk-created when the shipper accepts the winning bid.
  if (requestMode !== "company_target") {
    const [countRows] = await db().query(
      `SELECT COUNT(*) AS batchCount
       FROM ShipperRequest
       WHERE shipperRequestBatchId = ? AND shipperRequestDeletedAt IS NULL`,
      [shipperRequestBatchId],
    );
    const actualRequestCount = Number(countRows?.[0]?.batchCount ?? 0);
    if (actualRequestCount === 0) {
      throw new AppError("This batch contains no individual requests", 400);
    }
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
    "SELECT companyBidRequestId FROM CompanyBidRequest WHERE companyUniqueId = ? AND shipperRequestBatchId = ? AND companyBidRequestDeletedAt IS NULL",
    [companyUniqueId, shipperRequestBatchId],
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
      (companyBidRequestUniqueId, shipperRequestBatchId, companyUniqueId,
       bidSubmittedByUserUniqueId, numberOfVehiclesOffered, vehicleTypeUniqueId,
       proposedCostPerVehicle, proposedTotalCost, proposedShippingDate,
       proposedDeliveryDate, bidNotes, bidStatus, journeyStatusId,
       companyBidRequestCreatedBy, companyBidRequestCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?)`,
    [
      companyBidRequestUniqueId,
      shipperRequestBatchId,
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
        sendSocketIONotificationToShipper,
      } = require("../Utils/Notifications");
      sendSocketIONotificationToShipper({
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
            shipperRequestBatchId,
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
module.exports = {
  submitBid
};
