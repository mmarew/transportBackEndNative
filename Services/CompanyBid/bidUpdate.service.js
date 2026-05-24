"use strict";


const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const {
  db,
  findOne} = require("../CompanyHelper.service");
const logger = require("../../Utils/logger");
const {
  reportCompanyCommissionEvasion} = require("../CommissionEvasion.service");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { sendSocketIONotificationToCompany } = require("../../Utils/Notifications");
const messageTypes = require("../../Utils/MessageTypes");
const { journeyStatusMap, usersRoles } = require("../../Utils/ListOfSeedData");

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
const updateBidStatus = async (
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
    // ── COMPANY-TARGET vs INDIVIDUAL-TARGET handling ────────────────────────
    //
    // company_target (bulk-create on acceptance):
    //   No PR rows exist yet. We NOW bulk-create all N ShipperRequest rows
    //   at the moment the shipper accepts the winning company bid.
    //   Each row starts in `acceptedByShipper` status with no driver assigned.
    //   The dispatcher then calls createAssignment() to pair each row with a driver.
    //
    // individual_target (eager):
    //   PRs already exist from createShipperRequest. Lock and verify they're
    //   still free, then update their status.

    // 1. Check if PRs already exist for this batch
    const [existingPRs] = await db().query(
      `SELECT shipperRequestId, journeyStatusId
       FROM ShipperRequest
       WHERE shipperRequestBatchId = ?
         AND shipperRequestDeletedAt IS NULL
       FOR UPDATE`,
      [bid.shipperRequestBatchId],
    );

    if (existingPRs.length === 0) {
      // ── COMPANY-TARGET PATH: Bulk-create all N ShipperRequest rows now ──
      // Fetch full batch metadata needed to populate each row
      const [[batch]] = await db().query(
        `SELECT * FROM ShipperRequestBatch WHERE batchUniqueId = ? LIMIT 1`,
        [bid.shipperRequestBatchId],
      );
      if (!batch) {
        throw new AppError("Batch not found during acceptance", 409);
      }

      const { v4: uuidv4 } = require("uuid");
      const formatDateToReadable = require("../../Utils/FormatDateToReadable");
      const totalSlots = bid.numberOfVehiclesOffered;

      // Build a multi-row INSERT for all N slots in one query
      const placeholders = Array(totalSlots).fill(
        "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).join(", ");

      const values = [];
      for (let i = 0; i < totalSlots; i++) {
        values.push(
          uuidv4(),                                          // shipperRequestUniqueId
          batch.shipperUserUniqueId,                        // userUniqueId (shipper)
          batch.batchUniqueId,                              // shipperRequestBatchId
          batch.vehicleTypeUniqueId,                        // vehicleTypeUniqueId
          journeyStatusMap.acceptedByShipper,               // journeyStatusId — born accepted, no driver yet
          batch.requestMode,                                // requestMode
          batch.targetCompanyUniqueId,                      // targetCompanyUniqueId
          batch.originLatitude,
          batch.originLongitude,
          batch.originPlace,
          batch.destinationLatitude,
          batch.destinationLongitude,
          batch.destinationPlace,
          batch.shippableItemName,
          batch.shippableItemQtyInQuintal,
          batch.shippingDate ? formatDateToReadable(batch.shippingDate) : null,
          batch.deliveryDate ? formatDateToReadable(batch.deliveryDate) : null,
          batch.shippingCost,
          updatedBy,                                        // shipperRequestCreatedBy (shipper who accepted)
          usersRoles.shipperRoleId,                         // shipperRequestCreatedByRoleId
          currentDate(),                                    // shipperRequestCreatedAt
        );
      }

      await db().query(
        `INSERT INTO ShipperRequest
          (shipperRequestUniqueId, userUniqueId, shipperRequestBatchId,
           vehicleTypeUniqueId, journeyStatusId, requestMode, targetCompanyUniqueId,
           originLatitude, originLongitude, originPlace,
           destinationLatitude, destinationLongitude, destinationPlace,
           shippableItemName, shippableItemQtyInQuintal,
           shippingDate, deliveryDate, shippingCost,
           shipperRequestCreatedBy, shipperRequestCreatedByRoleId, shipperRequestCreatedAt)
         VALUES ${placeholders}`,
        values,
      );

      // Update the batch header status
      await db().query(
        `UPDATE ShipperRequestBatch
         SET journeyStatusId = ?, batchUpdatedAt = ?
         WHERE batchUniqueId = ?`,
        [journeyStatusMap.acceptedByShipper, currentDate(), bid.shipperRequestBatchId],
      );

      logger.info(
        `company_target bid accepted — ${totalSlots} ShipperRequest rows created`,
        {
          batchUniqueId: bid.shipperRequestBatchId,
          bidUniqueId: companyBidRequestUniqueId,
          totalVehicles: totalSlots},
      );
    } else {
      // ── INDIVIDUAL-TARGET EAGER PATH: PRs already exist → verify state ──
      const freeRequests = existingPRs.filter(
        (r) =>
          r.journeyStatusId === journeyStatusMap.waiting ||
          r.journeyStatusId === journeyStatusMap.requested ||
          r.journeyStatusId === journeyStatusMap.acceptedByDriver,
      );

      if (freeRequests.length < bid.numberOfVehiclesOffered) {
        const alreadyClaimed = existingPRs.length - freeRequests.length;
        throw new AppError(
          `Consistency Conflict: Only ${freeRequests.length} of ${bid.numberOfVehiclesOffered} requested vehicles are still available. ${alreadyClaimed} individual driver(s) have already been accepted for this freight.`,
          409,
        );
      }

      // Update existing PRs to accepted status
      await db().query(
        `UPDATE ShipperRequest
         SET journeyStatusId = ?
         WHERE shipperRequestBatchId = ? AND shipperRequestDeletedAt IS NULL`,
        [journeyStatusMap.acceptedByShipper, bid.shipperRequestBatchId],
      );
    }

    newPRStatus = null; // Already handled above — skip the generic UPDATE below
  } else if (
    bidStatus === "cancelled_by_company" ||
    bidStatus === "rejected_by_shipper" ||
    bidStatus === "expired"
  ) {
    newPRStatus = journeyStatusMap.waiting;

    // ── Commission evasion check ───────────────────────────────────────────
    // A company cancelling AFTER the shipper already accepted = evasion.
    // The previous bidStatus is still in `bid` (fetched before the UPDATE).
    // Fire post-commit (setImmediate) so it does NOT block this transaction.
    if (
      bidStatus === "cancelled_by_company" &&
      bid.bidStatus === "accepted_by_shipper"
    ) {
      setImmediate(async () => {
        try {
          const result = await reportCompanyCommissionEvasion({
            companyUniqueId: bid.companyUniqueId,
            reportedByUniqueId: updatedBy,
            journeyDecisionUniqueId: companyBidRequestUniqueId,
            reason: `Company cancelled freight bid after shipper acceptance (bid: ${companyBidRequestUniqueId})`});
          logger.info("Commission evasion recorded for company", {
            companyUniqueId: bid.companyUniqueId,
            automaticAction: result.automaticAction});
        } catch (err) {
          logger.error("Failed to record commission evasion", {
            companyUniqueId: bid.companyUniqueId,
            error: err.message});
        }
      });
    }
  }

  if (newPRStatus !== null) {
    await db().query(
      `UPDATE ShipperRequest
       SET journeyStatusId = ?
       WHERE shipperRequestBatchId = ? AND shipperRequestDeletedAt IS NULL`,
      [newPRStatus, bid.shipperRequestBatchId],
    );
  }

  const notificationMap = {
    accepted_by_shipper: {
      title: "Bid accepted",
      body: "The shipper has accepted your company's freight bid."},
    rejected_by_shipper: {
      title: "Bid rejected",
      body: "The shipper has rejected your company's freight bid."},
    cancelled_by_company: {
      title: "Bid cancelled",
      body: "Your company's bid has been cancelled."},
    expired: {
      title: "Bid expired",
      body: "Your company's bid has expired without a response."}};
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
        shipperRequestBatchId: bid.shipperRequestBatchId}}).catch((e) =>
      logger.error("FCM notification failed for bid status update", {
        error: e.message}),
    );

    // 🔔 Real-time WebSocket Notification
    const socketMessageTypeMap = {
      accepted_by_shipper: messageTypes.company_bid_accepted,
      rejected_by_shipper: messageTypes.company_bid_rejected,
      cancelled_by_company: messageTypes.company_bid_cancelled};

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
            shipperRequestBatchId: bid.shipperRequestBatchId}}}).catch((e) =>
        logger.error("WebSocket notification failed for company bid status", {
          error: e.message,
          companyUniqueId: bid.companyUniqueId}),
      );
    }
  }

  return { message: "success", data: "Bid status updated" };
};


// ── Mark cancellation as seen by company ──────────────────────────────────────
// Called when a company dispatcher opens/acknowledges the cancelled bid.
// Mirrors DriverRequest.isCancellationByShipperSeenByDriver pattern.
const markCancellationAsSeen = async ({
  companyBidRequestUniqueId,
  userUniqueId}) => {
  // 1. Fetch the bid
  const [[bid]] = await db().query(
    `SELECT cbr.companyBidRequestId,
            cbr.companyUniqueId,
            cbr.bidStatus,
            cbr.isCancellationSeenByCompany
       FROM CompanyBidRequest cbr
      WHERE cbr.companyBidRequestUniqueId = ?
        AND cbr.companyBidRequestDeletedAt IS NULL
      LIMIT 1`,
    [companyBidRequestUniqueId],
  );

  if (!bid) {
    throw new AppError("Bid not found", 404);
  }

  // 2. Verify the caller belongs to the company that owns the bid
  const [[membership]] = await db().query(
    `SELECT 1 FROM CompanyMembership
      WHERE companyUniqueId = ?
        AND userUniqueId = ?
        AND isActive = 1
        AND membershipDeletedAt IS NULL
      LIMIT 1`,
    [bid.companyUniqueId, userUniqueId],
  );

  if (!membership) {
    throw new AppError(
      "Unauthorized: you are not a member of this company",
      403,
    );
  }

  // 3. Guard: only mark if the bid is actually cancelled and unseen
  if (bid.bidStatus !== "cancelled_by_company") {
    throw new AppError(
      "This bid has not been cancelled — nothing to mark as seen",
      400,
    );
  }
  if (bid.isCancellationSeenByCompany === "seen by company") {
    return { message: "success", data: "Already marked as seen" };
  }

  // 4. Mark as seen
  await db().query(
    `UPDATE CompanyBidRequest
        SET isCancellationSeenByCompany = 'seen by company',
            companyBidRequestUpdatedAt  = ?
      WHERE companyBidRequestUniqueId = ?`,
    [currentDate(), companyBidRequestUniqueId],
  );

  return { message: "success", data: "Cancellation marked as seen" };
};

module.exports = {
  updateBidStatus,
  markCancellationAsSeen
};
