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
const { FINANCIAL_INSTITUTION_ACCOUNT_ENDPOINTS: EP } = require("../EndPoints/financialInstitutionAccount.endpoints");

router.post(
  EP.ROUTER.CREATE_FINANCIAL_INSTITUTION_ACCOUNT,
  verifyTokenOfAxios,
  validator(createAccount),
  controller.createFinancialInstitutionAccount,
);

router.get(
  EP.ROUTER.GET_ALL_FINANCIAL_INSTITUTION_ACCOUNTS,
  verifyTokenOfAxios,
  validator(getAccountsQuery, "query"),
  controller.getFinancialInstitutionAccounts,
);

router.put(
  EP.ROUTER.UPDATE_FINANCIAL_INSTITUTION_ACCOUNT,
  verifyTokenOfAxios,
  validator(accountParams, "params"),
  validator(updateAccount),
  controller.updateFinancialInstitutionAccountByUniqueId,
);

router.delete(
  EP.ROUTER.DELETE_FINANCIAL_INSTITUTION_ACCOUNT,
  verifyTokenOfAxios,
  validator(accountParams, "params"),
  controller.deleteFinancialInstitutionAccountByUniqueId,
);

module.exports = router;
