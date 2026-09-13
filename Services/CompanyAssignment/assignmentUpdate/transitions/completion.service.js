"use strict";

const { currentDate } = require("../../../../Utils/CurrentDate");
const { db } = require("../../../CompanyHelper.service");
const logger = require("../../../../Utils/logger");

const handleBatchCompletionCheck = async ({
  assignmentStatus,
  assignment,
  assignmentUniqueId,
}) => {
  // ── Batch completion check ─────────────────────────────────────────────────
  //
  // RULES:
  //   rejected_by_driver   → slot is OPEN again; dispatcher will reassign.
  //                          Do NOT change CompanyBidRequest at all.
  //   cancelled_by_driver /
  //   cancelled_by_company /
  //   cancelled_by_shipper → slot gone; only auto-complete if every other
  //                          slot is also gone / completed.
  //   completed            → check if all slots are now completed.
  //
  // The bid is marked 'completed' ONLY when every ShipperRequest slot in
  // the batch has a corresponding assignment with status = 'completed'.
  // A rejection leaves the slot available for reassignment — the bid stays
  // 'accepted_by_shipper' so the dispatcher can re-assign.
  //
  if (assignmentStatus === "rejected_by_driver") {
    // Slot is free again. No bid-level change needed.
    logger.info("Assignment rejected — slot open for reassignment", {
      assignmentUniqueId,
      companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
    });
  } else if (assignmentStatus === "completed") {
    // Check if EVERY slot in the batch now has a 'completed' assignment.
    const [[{ totalSlots }]] = await db().query(
      `SELECT COUNT(*) AS totalSlots
       FROM ShipperRequest
       WHERE shipperRequestBatchUniqueId = (
         SELECT shipperRequestBatchUniqueId FROM CompanyBidRequest
         WHERE companyBidRequestUniqueId = ? LIMIT 1
       )
         AND shipperRequestDeletedAt IS NULL`,
      [assignment.companyBidRequestUniqueId],
    );

    const [[{ completedSlots }]] = await db().query(
      `SELECT COUNT(*) AS completedSlots
       FROM CompanyBidVehicleAssignment
       WHERE companyBidRequestUniqueId = ?
         AND assignmentStatus = 'completed'
         AND assignmentDeletedAt IS NULL`,
      [assignment.companyBidRequestUniqueId],
    );

    if (completedSlots >= totalSlots && totalSlots > 0) {
      await db().query(
        `UPDATE CompanyBidRequest
         SET bidStatus = 'completed', companyBidRequestUpdatedAt = ?
         WHERE companyBidRequestUniqueId = ?`,
        [currentDate(), assignment.companyBidRequestUniqueId],
      );
      logger.info("Batch auto-completed: all slots delivered", {
        companyBidRequestUniqueId: assignment.companyBidRequestUniqueId,
        completedSlots,
        totalSlots,
      });
    }
  }
};

module.exports.handleBatchCompletionCheck = handleBatchCompletionCheck;
