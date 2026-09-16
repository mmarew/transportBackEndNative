const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/UserDeposit.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createUserDeposit,
  updateUserDeposit,
  depositParams,
  initiateSantimPay,
  getDepositQuery,
} = require("../../Validations/UserDeposit.schema");
const { USER_DEPOSIT_ENDPOINTS: EP } = require("../EndPoints/userDeposit.endpoints");

// Create new deposit
router.post(
  EP.ROUTER.CREATE_USER_DEPOSIT,
  verifyTokenOfAxios,
  validator(createUserDeposit),
  controller.createUserDeposit,
);
// Consolidated, fully-filterable GET
router.get(
  EP.ROUTER.GET_ALL_USER_DEPOSITS,
  verifyTokenOfAxios,
  validator(getDepositQuery, "query"),
  controller.getUserDeposit,
);
// Update deposit — admin only (approve/reject affects the wallet balance)
router.put(
  EP.ROUTER.UPDATE_USER_DEPOSIT,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(depositParams, "params"),
  validator(updateUserDeposit),
  controller.updateUserDepositByUniqueId,
);

// Delete deposit — admin only (reversal affects the wallet balance)
router.delete(
  EP.ROUTER.DELETE_USER_DEPOSIT,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(depositParams, "params"),
  controller.deleteUserDepositByUniqueId,
);

// Initiate SantimPay payment
router.post(
  EP.ROUTER.INITIATE_SANTIM_PAY,
  verifyTokenOfAxios,
  validator(initiateSantimPay),
  controller.initiateSantimPayPayment,
);

// Get Signed Token for SantimPay, disable it for now
// router.post(
//   "/getSignedToken",
//   verifyTokenOfAxios,
//   validator(getSignedToken),
//   controller.getSignedToken,
// );

// SantimPay webhook (no auth required - SantimPay calls this)
router.post(EP.ROUTER.SANTIM_PAY_WEBHOOK, controller.handleSantimPayWebhook);

module.exports = router;
