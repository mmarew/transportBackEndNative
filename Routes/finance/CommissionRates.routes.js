const express = require("express");
const router = express.Router();
const commissionRatesController = require("../../Controllers/CommissionRates.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createCommissionRate,
  updateCommissionRate,
  getAllCommissionRates,
  commissionRateIdSchema,
} = require("../../Validations/CommissionRates.schema");
const { COMMISSION_RATES_ENDPOINTS: EP } = require("../EndPoints/commissionRates.endpoints");

router.post(
  EP.ROUTER.CREATE_COMMISSION_RATE,
  verifyTokenOfAxios,
  validator(createCommissionRate),
  commissionRatesController.createCommissionRate,
);

router.get(
  EP.ROUTER.GET_ALL_COMMISSION_RATES,
  verifyTokenOfAxios,
  validator(getAllCommissionRates, "query"),
  commissionRatesController.getAllCommissionRates,
);

router.put(
  EP.ROUTER.UPDATE_COMMISSION_RATE,
  verifyTokenOfAxios,
  validator(commissionRateIdSchema, "params"),
  validator(updateCommissionRate),
  commissionRatesController.updateCommissionRateByUniqueId,
);

router.delete(
  EP.ROUTER.DELETE_COMMISSION_RATE,
  verifyTokenOfAxios,
  validator(commissionRateIdSchema, "params"),
  commissionRatesController.deleteCommissionRateByUniqueId,
);

module.exports = router;
