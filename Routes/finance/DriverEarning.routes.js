const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/DriverEarning.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  driverEarningQuery,
} = require("../../Validations/DriverEarning.schema");
const { DRIVER_EARNING_ENDPOINTS: EP } = require("../EndPoints/driverEarning.endpoints");
// this part is used to calculate earning f driver by filter
// driver can earn money from shipper which is in column shippingCostByDriver from JourneyDecisions
// # Get earnings for date range
// GET /api/earning/getDriverEarningsByFilter?driverUniqueId=self&fromDate=2026-01-01&toDate=2026-01-31

// # Get earnings with pagination
// GET /api/earning/getDriverEarningsByFilter?driverUniqueId=self&offset=30&limit=30

// # Get all earnings from a date onwards
// GET /api/earning/getDriverEarningsByFilter?driverUniqueId=self&fromDate=2026-01-01
router.get(
  EP.ROUTER.GET_DRIVER_EARNINGS_BY_FILTER,
  verifyTokenOfAxios,
  validator(driverEarningQuery, "query"),
  controller.getDriverEarningsByFilter,
);

module.exports = router;
