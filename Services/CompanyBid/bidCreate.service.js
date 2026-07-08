"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  findOne} = require("../CompanyHelper.service");
const logger = require("../../Utils/logger");



const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");
const { sendFCMNotificationToUser } = require("../Firebase.service");

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
    bidNotes} = data;

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
    shipperUserUniqueId} = batchRows[0];

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
  // ── Fetch full batch + offer data matching GET /api/company/bids shape ──
  let shipperNotifPayload = null;
  try {
    const [[batchRecord]] = await db().query(
      `SELECT b.batchUniqueId,
              b.batchUniqueId AS shipperRequestBatchId,
              b.batchId,
              b.originPlace, b.originLatitude, b.originLongitude,
              b.destinationPlace, b.destinationLatitude, b.destinationLongitude,
              b.shippableItemName, b.shippableItemQtyInQuintal,
              b.totalVehicles,
              b.shippingCost AS batchShippingCost,
              b.shippingDate AS batchShippingDate,
              b.deliveryDate AS batchDeliveryDate,
              b.journeyStatusId, b.requestMode, b.batchCreatedAt,
              u.fullName AS shipperName,
              vt.vehicleTypeName,
              js.journeyStatusName
       FROM ShipperRequestBatch b
       LEFT JOIN Users u ON b.shipperUserUniqueId = u.userUniqueId
       LEFT JOIN VehicleTypes vt ON b.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
       LEFT JOIN JourneyStatus js ON b.journeyStatusId = js.journeyStatusId
       WHERE b.batchUniqueId = ? LIMIT 1`,
      [shipperRequestBatchId],
    );

    const [[offerRecord]] = await db().query(
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
       WHERE cbr.companyBidRequestUniqueId = ? LIMIT 1`,
      [companyBidRequestUniqueId],
    );

    if (batchRecord && offerRecord) {
      shipperNotifPayload = {
        ...batchRecord,
        offerCount: 1,
        offers: [offerRecord],
      };
    }
  } catch (e) {
    logger.warn("Failed to fetch batch/offer for bid notification", {
      error: e.message,
      companyBidRequestUniqueId,
    });
  }

  // 🔔 Notify Shipper
  if (shipperUserUniqueId) {
    const [shipperRows] = await db().query(
      "SELECT phoneNumber FROM Users WHERE userUniqueId = ?",
      [shipperUserUniqueId],
    );

    if (shipperRows?.[0]?.phoneNumber) {
      const shipperNotif = {
        title: "New Company Bid",
        body: `${company.companyName} has submitted a bid for your freight.`,
      };

      // FCM — wear flat payload (key-value only, no nesting)
      sendFCMNotificationToUser({
        userUniqueId: shipperUserUniqueId,
        roleId: usersRoles.shipperRoleId,
        notification: shipperNotif,
        data: {
          type: "company_bid_submitted",
          companyBidRequestUniqueId,
          shipperRequestBatchId,
          companyName: company.companyName,
        },
      }).catch((e) =>
        logger.error("FCM to shipper failed in submitBid", {
          error: e.message,
          shipperUserUniqueId,
        }),
      );

      // WebSocket — full nested structure matching GET /api/company/bids
      const {
        sendSocketIONotificationToShipper,
      } = require("../../Utils/Notifications");
      sendSocketIONotificationToShipper({
        phoneNumber: shipperRows[0].phoneNumber,
        message: {
          messageTypes: messageTypes.company_bid_submitted,
          message: "success",
          notification: shipperNotif,
          data:
            shipperNotifPayload || {
              companyBidRequestUniqueId,
              shipperRequestBatchId,
              companyName: company.companyName,
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
