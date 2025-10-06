const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverDeposit.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsSupperAdmin,
} = require("../Middleware/VerifyToken");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");

// Create new deposit
router.post(
  "/api/driverDeposit",
  verifyTokenOfAxios,
  controller.createDriverDeposit
);
// Consolidated, fully-filterable GET
router.get(
  "/api/driverDeposit",
  verifyTokenOfAxios,
  controller.getDriverDeposit
);
// Update deposit
router.put(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.updateDriverDepositByUniqueId
);

// Delete deposit
router.delete(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.deleteDriverDepositByUniqueId
);
// Update status
router.patch(
  "/api/driverDeposit/status",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.updateDriverDepositStatus
);

module.exports = router;
