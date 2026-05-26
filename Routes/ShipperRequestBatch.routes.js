"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/ShipperRequestBatch.controller");
const schema = require("../Validations/ShipperRequestBatch.schema");
const { SHIPPER_REQUEST_BATCH_ENDPOINTS } = require("../Utils/ShipperRequestBatch.utils");
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
  SHIPPER_REQUEST_BATCH_ENDPOINTS.GET_BATCHES,
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
  SHIPPER_REQUEST_BATCH_ENDPOINTS.UPDATE_BATCH,
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
  SHIPPER_REQUEST_BATCH_ENDPOINTS.DELETE_BATCH,
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
  SHIPPER_REQUEST_BATCH_ENDPOINTS.CANCEL_BATCH,
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
const ARRAY_FIELDS = ["journeyStatusName", "journeyStatusId"];
const normalizeArrayQuery = (req, _res, next) => {
  for (const field of ARRAY_FIELDS) {
    const raw = req.query[field];
    if (!raw || Array.isArray(raw)) {continue;} // already an array or missing
    // Format 2: "[1,4,6]" or "[acceptedByDriver,partiallyCancelled]"
    if (typeof raw === "string" && raw.startsWith("[") && raw.endsWith("]")) {
      const inner = raw.slice(1, -1);
      req.query[field] = inner.split(",").map((s) => s.trim()).filter(Boolean);
    }
    // Format 3: "1,4,6" or "a,b,c" (no brackets)
    else if (typeof raw === "string" && raw.includes(",")) {
      req.query[field] = raw.split(",").map((s) => s.trim()).filter(Boolean);
    }
    // Format 1 (single value): leave as-is — schema handles string|number|array
  }
  // Coerce journeyStatusId values to integers (they arrive as strings from query)
  if (req.query.journeyStatusId) {
    const raw = req.query.journeyStatusId;
    req.query.journeyStatusId = Array.isArray(raw)
      ? raw.map(Number)
      : Number(raw);
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
 *  ── 5. FILTER BY STATUS ID (numeric) — single or array ───────
 *  GET .../slots?journeyStatusId=6
 *    → journeyCompleted (ID 6). Single status by ID.
 *
 *  GET .../slots?journeyStatusId=[4,5,6]
 *  GET .../slots?journeyStatusId=4&journeyStatusId=5&journeyStatusId=6
 *  GET .../slots?journeyStatusId=4,5,6
 *    → acceptedByShipper(4) + journeyStarted(5) + journeyCompleted(6).
 *    → Same result as using journeyStatusName but with numeric IDs.
 *    → ID reference: 1=waiting 2=requested 3=acceptedByDriver 4=acceptedByShipper
 *                    5=journeyStarted 6=journeyCompleted 7=cancelledByShipper
 *                    9=cancelledByDriver 17=partiallyCancelled
 *
 *  ── 6. COMBINED: cancellable + pagination ──────────────────────
 *  GET .../slots?cancellable=true&page=2&limit=50
 *    → Page 2 of cancellable slots, 50 per page.
 *
 *  GET .../slots?journeyStatusName=acceptedByShipper&page=1&limit=20
 *    → First 20 unassigned company slots (post-bid, awaiting dispatcher).
 *
 *  ── 7. SLOT STATE — drill into verifyShipperStatus.company counters ───
 *
 *  verifyShipperStatus returns a company breakdown like:
 *    notAssigned: 3, needsReassignment: 0, assigned: 2, driverConfirmed: 1
 *  Use ?slotState=<state> to get the actual list behind each counter.
 *
 *  GET .../slots?slotState=notAssigned
 *    → Free slots: status=acceptedByShipper, never had a driver assigned.
 *    → Dispatcher should assign a driver from the available fleet.
 *
 *  GET .../slots?slotState=needsReassignment
 *    → Free slots where a driver previously cancelled. Needs a new assignment.
 *    → Same status as notAssigned but flags historical driver cancellation.
 *
 *  GET .../slots?slotState=assigned
 *    → Driver has been notified but has not confirmed yet (assignment='assigned').
 *    → Dispatcher is waiting for driver response.
 *
 *  GET .../slots?slotState=driverConfirmed
 *    → Driver confirmed or heading to loading point. Journey imminent.
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
  SHIPPER_REQUEST_BATCH_ENDPOINTS.GET_BATCH_SLOTS,
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
  SHIPPER_REQUEST_BATCH_ENDPOINTS.PARTIAL_CANCEL_BATCH,
  verifyTokenOfAxios,
  validator(schema.batchParams, "params"),
  validator(schema.partialCancelBatchBody),
  controller.partialCancelBatch,
);

module.exports = router;
