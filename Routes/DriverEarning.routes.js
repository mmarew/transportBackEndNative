const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverEarning.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

router.get(
  `/api/earning/driver/:driverUniqueId/:fromDate/:toDate`,
  verifyTokenOfAxios,
  controller.getDriverEarningByDriverUniqueId
);

module.exports = router;
