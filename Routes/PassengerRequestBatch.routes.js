"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../Controllers/PassengerRequestBatch.controller");
const schema = require("../Validations/PassengerRequestBatch.schema");
const { validator } = require("../Middleware/Validator");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

/**
 * @route   GET /api/passengerRequestBatch
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
  "/api/passengerRequestBatch",
  verifyTokenOfAxios,
  validator(schema.getBatchesQuery, "query"),
  controller.getBatches,
);


/**
 * @route   PATCH /api/passengerRequestBatch/:batchUniqueId
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
  "/api/passengerRequestBatch/:batchUniqueId",
  verifyTokenOfAxios,
  validator(schema.batchParams, "params"),
  validator(schema.updateBatch),
  controller.updateBatch,
);

/**
 * @route   DELETE /api/passengerRequestBatch/:batchUniqueId
 * @desc    Soft-delete a batch (stamps batchDeletedAt)
 * @access  Authenticated
 */
router.delete(
  "/api/passengerRequestBatch/:batchUniqueId",
  verifyTokenOfAxios,
  validator(schema.batchParams, "params"),
  controller.deleteBatch,
);

module.exports = router;
