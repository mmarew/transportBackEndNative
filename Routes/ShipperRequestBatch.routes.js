"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/ShipperRequestBatch.controller");
const schema = require("../Validations/ShipperRequestBatch.schema");
const { validator } = require("../Middleware/Validator");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

/**
 * @route   GET /api/shipperRequestBatch
 * @desc    List batches with optional filters + pagination
 * @access  Authenticated
 *
 * Query params (all optional):
 *   batchUniqueId, shipperUserUniqueId, vehicleTypeUniqueId,
 *   requestMode, targetCompanyUniqueId, journeyStatusId,
 *   journeyStatusName, originPlace, destinationPlace,
 *   includeDeleted, page, limit
 */
router.get(
  "/api/shipperRequestBatch",
  verifyTokenOfAxios,
  validator(schema.getBatchesQuery, "query"),
  controller.getBatches,
);

/**
 * @route   PATCH /api/shipperRequestBatch/:batchUniqueId
 * @desc    Partially update a batch — only supplied fields are changed
 * @access  Authenticated
 *
 * Body (at least one required):
 *   totalVehicles, requestMode, targetCompanyUniqueId, vehicleTypeUniqueId,
 *   originPlace, destinationPlace, shippableItemName,
 *   shippableItemQtyInQuintal, shippingDate, deliveryDate,
 *   shippingCost, journeyStatusId
 */
router.patch(
  "/api/shipperRequestBatch/:batchUniqueId",
  verifyTokenOfAxios,
  validator(schema.batchParams, "params"),
  validator(schema.updateBatch),
  controller.updateBatch,
);

/**
 * @route   DELETE /api/shipperRequestBatch/:batchUniqueId
 * @desc    Soft-delete a batch (stamps batchDeletedAt)
 * @access  Authenticated
 */
router.delete(
  "/api/shipperRequestBatch/:batchUniqueId",
  verifyTokenOfAxios,
  validator(schema.batchParams, "params"),
  controller.deleteBatch,
);

/**
 * @route   PUT /api/shipperRequestBatch/:batchUniqueId/cancel
 * @desc    Atomically cancel a company freight batch and all related records
 * @access  Authenticated (shipper who owns the batch, or admin)
 *
 * One atomic DB transaction updates:
 *   ShipperRequestBatch, ShipperRequest (all rows),
 *   JourneyDecisions, DriverRequest, CompanyBidRequest, CompanyBidVehicleAssignment
 *
 * Body (optional): { cancellationReasonsTypeId }
 */
router.put(
  "/api/shipperRequestBatch/:batchUniqueId/cancel",
  verifyTokenOfAxios,
  validator(schema.batchParams, "params"),
  validator(schema.cancelBatchBody),
  controller.cancelBatch,
);

/**
 * Normalises bracket-array query strings before Joi validation.
 * Supports all three common client formats for array params:
 *   1. Repeated key:    ?name=a&name=b         (Express parses natively → array)
 *   2. Bracket string:  ?name=[a,b,c]          (parse here → array)
 *   3. Comma-separated: ?name=a,b,c            (split here → array)
 *
 * Only applied to the fields listed in ARRAY_FIELDS.
 */
const ARRAY_FIELDS = ["journeyStatusName"];
const normalizeArrayQuery = (req, _res, next) => {
  for (const field of ARRAY_FIELDS) {
    const raw = req.query[field];
    if (!raw || Array.isArray(raw)) {
      next(); return; // already an array or missing — Joi handles it
    }
    // Format 2: "[acceptedByDriver,partiallyCancelled]"
    if (typeof raw === "string" && raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1);
      req.query[field] = inner.split(",").map((s) => s.trim()).filter(Boolean);
    }
    // Format 3: "a,b,c" (no brackets)
    else if (typeof raw === "string" && raw.includes(",")) {
      req.query[field] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    // Format 1 (single string): leave as-is — Joi alternatives handles string|array
  }
  next();
};

/**
 * @route   GET /api/shipperRequestBatch/:batchUniqueId/slots
 * @desc    Returns all ShipperRequest slots in a batch with a `cancellable` flag.
 *          Supports flexible filtering, pagination, and multi-status queries.
 * @access  Authenticated
 *
 * ═══════════════════════════════════════════════════════════════
 *  URL COMBINATIONS — USE CASES
 * ═══════════════════════════════════════════════════════════════
 *
 *  ── 1. ALL SLOTS (no filter) ───────────────────────────────────
 *  GET .../slots
 *    → Returns every slot in the batch regardless of status.
 *    → Use to render the full slot list in the dispatcher dashboard.
 *
 *  ── 2. ONLY CANCELLABLE SLOTS ──────────────────────────────────
 *  GET .../slots?cancellable=true
 *    → Statuses: waiting(1) | requested(2) | acceptedByDriver(3) | acceptedByShipper(4)
 *    → Use for the "Select slots to cancel" picker UI.
 *
 *  ── 3. SINGLE STATUS FILTER ────────────────────────────────────
 *  GET .../slots?journeyStatusName=cancelledByShipper
 *    → Only cancelled slots. Use to show what the shipper already cancelled.
 *
 *  GET .../slots?journeyStatusName=acceptedByShipper
 *    → Slots accepted but not yet assigned to a driver. Ready for dispatch.
 *
 *  GET .../slots?journeyStatusName=waiting
 *    → Unmatched slots still waiting for a driver or company bid.
 *
 *  GET .../slots?journeyStatusName=journeyStarted
 *    → Slots currently in transit (driver heading to destination).
 *
 *  GET .../slots?journeyStatusName=journeyCompleted
 *    → Delivered slots. Use for completion tracking / invoicing.
 *
 *  GET .../slots?journeyStatusName=cancelledByDriver
 *    → Slots a driver cancelled after confirming. Need reassignment.
 *
 *  GET .../slots?journeyStatusName=partiallyCancelled
 *    → Batch is partially cancelled (some slots done, some cancelled).
 *
 *  ── 4. MULTIPLE STATUS FILTER (all three formats are accepted) ──
 *  GET .../slots?journeyStatusName=[acceptedByShipper,journeyStarted]
 *  GET .../slots?journeyStatusName=acceptedByShipper&journeyStatusName=journeyStarted
 *  GET .../slots?journeyStatusName=acceptedByShipper,journeyStarted
 *    → Active pipeline: slots assigned OR in transit. Use for live tracking view.
 *
 *  GET .../slots?journeyStatusName=[cancelledByShipper,cancelledByDriver,cancelledByAdmin]
 *    → All cancelled slots (by any actor). Use for cancellation report.
 *
 *  GET .../slots?journeyStatusName=[journeyCompleted,cancelledByShipper]
 *    → Terminal slots only. Use to identify what is fully done.
 *
 *  GET .../slots?journeyStatusName=[waiting,requested,acceptedByDriver]
 *    → Pre-acceptance pipeline. Equivalent to unconfirmed/pending slots.
 *
 *  ── 5. FILTER BY STATUS ID (numeric) ───────────────────────────
 *  GET .../slots?journeyStatusId=6
 *    → journeyCompleted. Same as journeyStatusName=journeyCompleted.
 *    → Useful when the client stores the numeric ID instead of the name.
 *
 *  ── 6. COMBINED: cancellable + pagination ──────────────────────
 *  GET .../slots?cancellable=true&page=2&limit=50
 *    → Page 2 of cancellable slots, 50 per page.
 *
 *  GET .../slots?journeyStatusName=acceptedByShipper&page=1&limit=20
 *    → First 20 unassigned company slots (post-bid, awaiting dispatcher).
 *
 *  ── Valid journeyStatusName values ─────────────────────────────
 *  waiting | requested | acceptedByDriver | acceptedByShipper |
 *  journeyStarted | journeyCompleted | cancelledByShipper |
 *  rejectedByShipper | cancelledByDriver | cancelledByAdmin |
 *  completedByAdmin | cancelledBySystem | noAnswerFromDriver |
 *  notSelectedInBid | rejectedByDriver | replacedByCompanyAssignment |
 *  partiallyCancelled
 */
router.get(
  "/api/shipperRequestBatch/:batchUniqueId/slots",
  verifyTokenOfAxios,
  normalizeArrayQuery,
  validator(schema.batchParams, "params"),
  validator(schema.batchSlotsQuery, "query"),
  controller.getCancellableSlots,
);

/**
 * @route   PUT /api/shipperRequestBatch/:batchUniqueId/partialCancel
 * @desc    Cancel only specific slots (by shipperRequestUniqueId) in a batch.
 *          Slots already in-transit or terminal are rejected.
 *          Batch status becomes partiallyCancelled (17) if active slots remain,
 *          or cancelledByShipper (7) if all slots are now done.
 * @access  Authenticated (batch owner or admin)
 *
 * Body: { slotIds: [uuid, ...], cancellationReasonsTypeId? }
 */
router.put(
  "/api/shipperRequestBatch/:batchUniqueId/partialCancel",
  verifyTokenOfAxios,
  validator(schema.batchParams, "params"),
  validator(schema.partialCancelBatchBody),
  controller.partialCancelBatch,
);

module.exports = router;
