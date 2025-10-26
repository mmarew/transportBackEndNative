const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DriverEarning.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

router.get(
  `/api/earning/getDriverEarningsByFilter`,
  verifyTokenOfAxios,
  controller.getDriverEarningsByFilter
);

module.exports = router;
