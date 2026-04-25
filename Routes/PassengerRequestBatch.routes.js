"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/PassengerRequestBatch.controller");
const schema = require("../Validations/PassengerRequestBatch.schema");
const { validator } = require("../Middleware/Validator");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// All routes require a valid JWT
router.use(verifyTokenOfAxios);

/**
 * @route   GET /api/passenger-request-batches
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
  "/",
  validator(schema.getBatchesQuery, "query"),
  controller.getBatches,
);

/**
 * @route   GET /api/passenger-request-batches/:batchUniqueId
 * @desc    Fetch a single batch by UUID
 * @access  Authenticated
 */
router.get(
  "/:batchUniqueId",
  validator(schema.batchParams, "params"),
  controller.getBatchById,
);

/**
 * @route   PATCH /api/passenger-request-batches/:batchUniqueId
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
  "/:batchUniqueId",
  validator(schema.batchParams, "params"),
  validator(schema.updateBatch),
  controller.updateBatch,
);

/**
 * @route   DELETE /api/passenger-request-batches/:batchUniqueId
 * @desc    Soft-delete a batch (stamps batchDeletedAt)
 * @access  Authenticated
 */
router.delete(
  "/:batchUniqueId",
  validator(schema.batchParams, "params"),
  controller.deleteBatch,
);

module.exports = router;
