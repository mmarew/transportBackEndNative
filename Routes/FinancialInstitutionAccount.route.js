const express = require("express");
const router = express.Router();
const controller = require("../Controllers/FinancialInstitutionAccount.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

router.post(
  "/api/financialInstitutionAccount",
  verifyTokenOfAxios,
  controller.createFinancialInstitutionAccount
);

router.get(
  "/api/financialInstitutionAccount",
  verifyTokenOfAxios,
  controller.getAllFinancialInstitutionAccounts
);

router.get(
  "/api/financialInstitutionAccount/:accountUniqueId",
  verifyTokenOfAxios,
  controller.getFinancialInstitutionAccountByUniqueId
);

router.put(
  "/api/financialInstitutionAccount/:accountUniqueId",
  verifyTokenOfAxios,
  controller.updateFinancialInstitutionAccountByUniqueId
);

router.delete(
  "/api/financialInstitutionAccount/:accountUniqueId",
  verifyTokenOfAxios,
  controller.deleteFinancialInstitutionAccountByUniqueId
);

module.exports = router;
