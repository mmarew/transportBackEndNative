const express = require("express");
const router = express.Router();
const commissionRatesController = require("../Controllers/CommissionRates.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");

router.post(
  "/api/admin/commissionRates",
  verifyTokenOfAxios,
  commissionRatesController.createCommissionRate
);
router.get(
  "/api/admin/commissionRates",
  verifyTokenOfAxios,
  commissionRatesController.getAllCommissionRates
);
router.get(
  "/api/admin/commissionRates/:commissionRateUniqueId",
  verifyTokenOfAxios,
  commissionRatesController.getCommissionRateByUniqueId
);
router.put(
  "/api/admin/commissionRates/:commissionRateUniqueId",
  verifyTokenOfAxios,
  commissionRatesController.updateCommissionRateByUniqueId
);
router.delete(
  "/api/admin/commissionRates/:commissionRateUniqueId",
  verifyTokenOfAxios,
  commissionRatesController.deleteCommissionRateByUniqueId
);

module.exports = router;
