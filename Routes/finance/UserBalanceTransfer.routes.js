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
const { USER_BALANCE_TRANSFER_ENDPOINTS: EP } = require("../EndPoints/userBalanceTransfer.endpoints");

// Create
router.post(
  EP.ROUTER.CREATE_TRANSFER,
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(createTransfer),
  controller.createTransfer,
);

// Get all transfers
router.get(
  EP.ROUTER.GET_ALL_TRANSFERS,
  verifyTokenOfAxios,
  validator(transferQuery, "query"),
  controller.getAllTransfers,
);

// Get by UUID
router.get(
  EP.ROUTER.GET_TRANSFER_BY_UNIQUE_ID,
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  controller.getTransferByUniqueId,
);

// Get by fromDriver
router.get(
  EP.ROUTER.GET_TRANSFERS_BY_FROM_DRIVER,
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(transferQuery, "query"),
  controller.getTransfersByFromDriverId,
);

// Get by toDriver
router.get(
  EP.ROUTER.GET_TRANSFERS_BY_TO_DRIVER,
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(transferQuery, "query"),
  controller.getTransfersByToDriverId,
);

// Update transfer by UUID - Dedicated PUT route for balance transfer updates
router.put(
  EP.ROUTER.UPDATE_TRANSFER,
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  validator(updateTransfer),
  controller.updateTransferByUniqueId,
);

// Delete by UUID
router.delete(
  EP.ROUTER.DELETE_TRANSFER,
  verifyTokenOfAxios,
  validator(transferParams, "params"),
  controller.deleteTransferByUniqueId,
);

module.exports = router;
