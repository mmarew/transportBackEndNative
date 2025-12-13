const express = require("express");
const router = express.Router();
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const AccountController = require("../Controllers/Account.controller");

// Account status: documents, vehicle and banned checks
router.get(
  "/api/account/status",
  verifyTokenOfAxios,
  AccountController.accountStatus
);

module.exports = router;
