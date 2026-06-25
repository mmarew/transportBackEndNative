const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/FinancialInstitutionAccount.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createAccount,
  updateAccount,
  accountParams,
  getAccountsQuery,
} = require("../../Validations/FinancialInstitutionAccount.schema");

router.post(
  "/",
  verifyTokenOfAxios,
  validator(createAccount),
  controller.createFinancialInstitutionAccount,
);

router.get(
  "/",
  verifyTokenOfAxios,
  validator(getAccountsQuery, "query"),
  controller.getFinancialInstitutionAccounts,
);

router.put(
  "/:accountUniqueId",
  verifyTokenOfAxios,
  validator(accountParams, "params"),
  validator(updateAccount),
  controller.updateFinancialInstitutionAccountByUniqueId,
);

router.delete(
  "/:accountUniqueId",
  verifyTokenOfAxios,
  validator(accountParams, "params"),
  controller.deleteFinancialInstitutionAccountByUniqueId,
);

module.exports = router;
