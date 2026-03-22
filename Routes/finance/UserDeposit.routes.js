const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/UserDeposit.controller");
const {
  verifyTokenOfAxios,
} = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createUserDeposit,
  updateUserDeposit,
  depositParams,
  initiateSantimPay,
  getDepositQuery,
} = require("../../Validations/UserDeposit.schema");

// Create new deposit
router.post(
  "/",
  verifyTokenOfAxios,
  validator(createUserDeposit),
  controller.createUserDeposit,
);
// Consolidated, fully-filterable GET
router.get(
  "/",
  verifyTokenOfAxios,
  validator(getDepositQuery, "query"),
  controller.getUserDeposit,
);
// Update deposit
router.put(
  "/:userDepositUniqueId",
  verifyTokenOfAxios,
  // verifyIfUserIsAdminOrSupperAdmin,
  validator(depositParams, "params"),
  validator(updateUserDeposit),
  controller.updateUserDepositByUniqueId,
);

// Delete deposit
router.delete(
  "/:userDepositUniqueId",
  verifyTokenOfAxios,
  // verifyIfUserIsAdminOrSupperAdmin,
  validator(depositParams, "params"),
  controller.deleteUserDepositByUniqueId,
);

// Initiate SantimPay payment
router.post(
  "/initiateSantimPay",
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
router.post("/santimPay/webhook", controller.handleSantimPayWebhook);

module.exports = router;
