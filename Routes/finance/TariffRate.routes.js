const express = require("express");
const router = express.Router();
const tariffRateController = require("../../Controllers/TariffRate.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

// Create a new tariff rate
const { validator } = require("../../Middleware/Validator");
const {
  createTariffRate,
  updateTariffRate,
  tariffRateParams,
  getTariffRatesByFiltersQuery,
} = require("../../Validations/TariffRate.schema");
const { TARIFF_RATE_ENDPOINTS: EP } = require("../EndPoints/tariffRate.endpoints");

// Create a new tariff rate
router.post(
  EP.ROUTER.CREATE_TARIFF_RATE,
  verifyTokenOfAxios,
  validator(createTariffRate),
  tariffRateController.createTariffRate,
);

// Get tariff rates with filtering and pagination
// Examples:
//   GET /                                          → all rates (paginated)
//   GET /?tariffRateUniqueId=uuid                  → single rate by ID
//   GET /?tariffRateName=base&page=1&limit=5       → search by name
router.get(
  EP.ROUTER.GET_ALL_TARIFF_RATES,
  verifyTokenOfAxios,
  validator(getTariffRatesByFiltersQuery, "query"),
  tariffRateController.getTariffRatesByFilter,
);

// Update a tariff rate by ID
router.put(
  EP.ROUTER.UPDATE_TARIFF_RATE,
  verifyTokenOfAxios,
  validator(tariffRateParams, "params"),
  validator(updateTariffRate),
  tariffRateController.updateTariffRate,
);

// Delete a tariff rate by ID
router.delete(
  EP.ROUTER.DELETE_TARIFF_RATE,
  verifyTokenOfAxios,
  validator(tariffRateParams, "params"),
  tariffRateController.deleteTariffRate,
);

module.exports = router;
