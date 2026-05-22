"use strict";
const Joi = require("joi");
const { uuidSchema } = require("../Middleware/Validator");

// ── ShipperRequestBatch ──────────────────────────────────────────────────────

/**
 * GET /api/shipperRequestBatch
 *
 * All params are optional and composable.
 * Every column in ShipperRequestBatch can be used as a filter.
 *
 * ── Identity filters (exact match) ──────────────────────────────────────────
 *   batchUniqueId           UUID of a specific batch
 *   shipperUserUniqueId     UUID of the shipper who created the batch
 *   vehicleTypeUniqueId     UUID of the required vehicle type
 *   targetCompanyUniqueId   UUID of the targeted company (company_target mode)
 *   requestMode             'individual_target' | 'company_target'
 *   journeyStatusId         Exact status ID (integer)
 *   journeyStatusName       Exact status name string (see valid values below)
 *   totalVehicles           Exact number of vehicles in the batch
 *
 * ── Text search (partial LIKE match) ────────────────────────────────────────
 *   originPlace             Partial match on origin place name
 *   destinationPlace        Partial match on destination place name
 *   shippableItemName       Partial match on cargo item name
 *
 * ── Date range filters ───────────────────────────────────────────────────────
 *   shippingDateFrom / shippingDateTo     ISO date range for shippingDate
 *   deliveryDateFrom / deliveryDateTo     ISO date range for deliveryDate
 *   createdFrom / createdTo               ISO date range for batchCreatedAt
 *
 * ── Cost range filters ───────────────────────────────────────────────────────
 *   shippingCostMin / shippingCostMax     Numeric range for shippingCost
 *
 * ── Soft-delete ──────────────────────────────────────────────────────────────
 *   includeDeleted    boolean — include soft-deleted batches (default false)
 *
 * ── Pagination ───────────────────────────────────────────────────────────────
 *   page (default 1), limit (default 10, max 100)
 *
 * Valid journeyStatusName values:
 *   waiting | requested | acceptedByDriver | acceptedByShipper |
 *   journeyStarted | journeyCompleted | cancelledByShipper |
 *   rejectedByShipper | cancelledByDriver | cancelledByAdmin |
 *   completedByAdmin | cancelledBySystem | noAnswerFromDriver |
 *   notSelectedInBid | rejectedByDriver | replacedByCompanyAssignment |
 *   partiallyCancelled
 */
exports.getBatchesQuery = Joi.object({
  // ── Identity ──
  batchUniqueId:          uuidSchema.optional(),
  shipperUserUniqueId:    uuidSchema.optional(),
  vehicleTypeUniqueId:    uuidSchema.optional(),
  targetCompanyUniqueId:  uuidSchema.optional(),
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .optional(),
  journeyStatusId:   Joi.number().integer().min(1).optional(),
  journeyStatusName: Joi.string()
    .valid(
      "waiting", "requested", "acceptedByDriver", "acceptedByShipper",
      "journeyStarted", "journeyCompleted", "cancelledByShipper",
      "rejectedByShipper", "cancelledByDriver", "cancelledByAdmin",
      "completedByAdmin", "cancelledBySystem", "noAnswerFromDriver",
      "notSelectedInBid", "rejectedByDriver", "replacedByCompanyAssignment",
      "partiallyCancelled",
    )
    .optional(),
  totalVehicles: Joi.number().integer().min(1).optional(),

  // ── Text search ──
  originPlace:      Joi.string().max(255).optional(),
  destinationPlace: Joi.string().max(255).optional(),
  shippableItemName: Joi.string().max(100).optional(),

  // ── Date ranges ──
  shippingDateFrom: Joi.date().iso().optional(),
  shippingDateTo:   Joi.date().iso().optional(),
  deliveryDateFrom: Joi.date().iso().optional(),
  deliveryDateTo:   Joi.date().iso().optional(),
  createdFrom:      Joi.date().iso().optional(),
  createdTo:        Joi.date().iso().optional(),

  // ── Cost range ──
  shippingCostMin: Joi.number().min(0).optional(),
  shippingCostMax: Joi.number().min(0).optional(),

  // ── Soft-delete ──
  includeDeleted: Joi.boolean().optional(),

  // ── Pagination ──
  page:  Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
}).unknown(false);

/**
 * PATCH /api/shipper-request-batches/:batchUniqueId
 * At least one field must be present. Only the provided fields are updated.
 */
exports.updateBatch = Joi.object({
  totalVehicles: Joi.number().integer().min(1).optional(),
  requestMode: Joi.string()
    .valid("individual_target", "company_target")
    .optional(),
  targetCompanyUniqueId: uuidSchema.optional().allow(null),
  originPlace: Joi.string().max(255).optional(),
  destinationPlace: Joi.string().max(255).optional(),
  shippableItemName: Joi.string().max(100).optional().allow(null, ""),
  shippableItemQtyInQuintal: Joi.number().min(0).optional().allow(null),
  shippingDate: Joi.date().iso().optional().allow(null),
  deliveryDate: Joi.date().iso().optional().allow(null),
  shippingCost: Joi.number().min(0).optional().allow(null),
  journeyStatusId: Joi.number().integer().min(1).optional(),
  vehicleTypeUniqueId: uuidSchema.optional(),
})
  .min(1) // at least one field required
  .unknown(true);

/**
 * URL param: batchUniqueId
 */
exports.batchParams = Joi.object({
  batchUniqueId: uuidSchema.required(),
});

/**
 * PUT /api/shipperRequestBatch/:batchUniqueId/cancel
 * Body is optional — only cancellationReasonsTypeId is accepted.
 */
exports.cancelBatchBody = Joi.object({
  cancellationReasonsTypeId: Joi.number()
    .integer()
    .min(1)
    .optional()
    .allow(null),
}).unknown(false);

/**
 * PUT /api/shipperRequestBatch/:batchUniqueId/partialCancel
 *
 * slotIds  – array of shipperRequestUniqueId strings for the slots to cancel.
 *            Must have at least 1 entry.
 * cancellationReasonsTypeId – optional reason FK (same as full cancel).
 */
exports.partialCancelBatchBody = Joi.object({
  slotIds: Joi.array()
    .items(uuidSchema.required())
    .min(1)
    .required()
    .messages({
      "array.min": "At least one slotId must be provided",
      "any.required": "slotIds is required",
    }),
  cancellationReasonsTypeId: Joi.number()
    .integer()
    .min(1)
    .optional()
    .allow(null),
}).unknown(false);

// Valid status names (shared between single-value and array validation)
const VALID_JOURNEY_STATUS_NAMES = [
  "waiting",
  "requested",
  "acceptedByDriver",
  "acceptedByShipper",
  "journeyStarted",
  "journeyCompleted",
  "cancelledByShipper",
  "rejectedByShipper",
  "cancelledByDriver",
  "cancelledByAdmin",
  "completedByAdmin",
  "cancelledBySystem",
  "noAnswerFromDriver",
  "notSelectedInBid",
  "rejectedByDriver",
  "replacedByCompanyAssignment",
  "partiallyCancelled",
];

/**
 * GET /api/shipperRequestBatch/:batchUniqueId/slots
 *
 * All query params are optional and composable:
 *   cancellable=true          – only slots that can still be cancelled (status 1-4)
 *   journeyStatusId=6         – filter by exact status ID
 *   journeyStatusName=...     – single status name OR array of status names
 *                               e.g. ?journeyStatusName=acceptedByShipper
 *                                    ?journeyStatusName=acceptedByShipper&journeyStatusName=journeyStarted
 *   page=1                    – page number (default 1)
 *   limit=20                  – page size (default 20, max 100)
 *
 * Valid journeyStatusName values:
 *   waiting | requested | acceptedByDriver | acceptedByShipper |
 *   journeyStarted | journeyCompleted | cancelledByShipper |
 *   rejectedByShipper | cancelledByDriver | cancelledByAdmin |
 *   completedByAdmin | cancelledBySystem | noAnswerFromDriver |
 *   notSelectedInBid | rejectedByDriver | replacedByCompanyAssignment |
 *   partiallyCancelled
 */
exports.batchSlotsQuery = Joi.object({
  cancellable: Joi.boolean().optional(),
  // Accept a single integer OR an array of integers — same pattern as journeyStatusName.
  journeyStatusId: Joi.alternatives()
    .try(
      Joi.number().integer().min(1),
      Joi.array().items(Joi.number().integer().min(1)).min(1),
    )
    .optional(),
  // Accept a single string OR an array of strings — both validated against the same enum.
  journeyStatusName: Joi.alternatives()
    .try(
      Joi.string().valid(...VALID_JOURNEY_STATUS_NAMES),
      Joi.array().items(Joi.string().valid(...VALID_JOURNEY_STATUS_NAMES)).min(1),
    )
    .optional(),
  // slotState maps to the assignment-pipeline sub-states shown in
  // verifyShipperStatus.company — use this to get the list behind each counter.
  slotState: Joi.string()
    .valid("notAssigned", "needsReassignment", "assigned", "driverConfirmed")
    .optional(),
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
}).unknown(false);
