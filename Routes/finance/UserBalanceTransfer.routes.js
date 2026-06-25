const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/UserBalanceTransfer.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

// Create
const { validator } = require("../../Middleware/Validator");
const {
  createTransfer,
  updateTransfer,
  transferParams,
  transferQuery,
} = require("../../Validations/UserBalanceTransfer.schema");

// Create
router.post(
  "/:transferredBy",
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(createTransfer),
  controller.createTransfer,
);

// Get all transfers
router.get(
  "/",
  verifyTokenOfAxios,
  validator(transferQuery, "query"),
  controller.getAllTransfers,
);

// Get by UUID
router.get(
  "/:depositTransferUniqueId",
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  controller.getTransferByUniqueId,
);

// Get by fromDriver
router.get(
  "/from/:fromDriverUniqueId",
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(transferQuery, "query"),
  controller.getTransfersByFromDriverId,
);

// Get by toDriver
router.get(
  "/to/:toDriverUniqueId",
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(transferQuery, "query"),
  controller.getTransfersByToDriverId,
);

// Update transfer by UUID - Dedicated PUT route for balance transfer updates
router.put(
  "/:depositTransferUniqueId",
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(updateTransfer),
  controller.updateTransferByUniqueId,
);

// Delete by UUID
router.delete(
  "/:depositTransferUniqueId",
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  controller.deleteTransferByUniqueId,
);

module.exports = router;
