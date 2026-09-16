const express = require("express");
const router = express.Router();
const userBalanceController = require("../../Controllers/UserBalance.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createUserBalance,
  balanceParams,
} = require("../../Validations/UserBalance.schema");
const { USER_BALANCE_ENDPOINTS: EP } = require("../EndPoints/userBalance.endpoints");

// Create a new driver balance record
router.post(
  EP.ROUTER.CREATE_USER_BALANCE,
  verifyTokenOfAxios,
  validator(createUserBalance),
  userBalanceController.createUserBalance,
);

// Unified GET endpoint with filters and pagination
router.get(
  EP.ROUTER.GET_ALL_USER_BALANCES,
  verifyTokenOfAxios,
  userBalanceController.getUserBalanceByFilter,
);

// Update a driver balance record by ID
router.put(
  EP.ROUTER.UPDATE_USER_BALANCE,
  verifyTokenOfAxios,
  validator(balanceParams, "params"),
  userBalanceController.updateUserBalance,
);

// Delete a driver balance record by ID
router.delete(
  EP.ROUTER.DELETE_USER_BALANCE,
  verifyTokenOfAxios,
  validator(balanceParams, "params"),
  userBalanceController.deleteUserBalance,
);
module.exports = router;
