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
 * @route   GET /api/shipperRequestBatch/:batchUniqueId/slots
 * @desc    Returns all slots in the batch with a `cancellable` boolean flag.
 *          Pass ?cancellable=true to return only the cancellable ones.
 * @access  Authenticated
 */
router.get(
  "/api/shipperRequestBatch/:batchUniqueId/slots",
  verifyTokenOfAxios,
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
