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
// Get all deposit data
router.get("/api/driverDeposit", controller.getDriverDeposit);

// get all deposit by status
router.get(
  "/api/getAllDriverDepositDataByStatus/:status",
  controller.getAllDriverDepositDataByStatus
);
// get all deposit by status
router.get(
  "/api/getOneDriverDepositDataByStatus/:driverUserUniqueId/:status",
  controller.getOneDriverDepositDataByStatus
);

// Get all deposits (with account & source info) — optional filter
router.get(
  "/api/driverDepositWithAccount",
  verifyTokenOfAxios,
  controller.getDriverDepositsWithAccountInfo
);

// Get single deposit
router.get(
  "/api/driverDeposit/:driverDepositUniqueId",
  verifyTokenOfAxios,
  controller.getDriverDepositByUniqueId
);
// get single deposit by driverDepositUniqueId and driverUniqueId
router.get(
  "/api/driverDeposit/deposite/:driverDepositUniqueId/driver/:driverUniqueId",
  verifyTokenOfAxios,
  controller.getDriverDepositByUniqueIdAndDriverUniqueId
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
router.get(
  "/api/driverDepositByDateRange",
  verifyTokenOfAxios,
  controller.getDepositsByDateRangeAndDriver
);
// Update status
router.patch(
  "/api/driverDeposit/status",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  controller.updateDriverDepositStatus
);
router.get(
  "/api/driverDeposit/status/unauthorized",
  verifyTokenOfAxios,
  controller.getUnauthorizedDeposits
);
// get all count of unauthorized deposits
router.get(
  "/api/driverDeposit/status/unauthorized/count",
  verifyTokenOfAxios,
  controller.getUnauthorizedDepositsCount
);

module.exports = router;
