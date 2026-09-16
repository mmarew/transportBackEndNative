const express = require("express");
const router = express.Router();
const commissionController = require("../../Controllers/Commission.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const { validator } = require("../../Middleware/Validator");
const {
  createCommission,
  updateCommission,
  getAllCommissions,
  commissionIdSchema,
} = require("../../Validations/Commission.schema");
const { COMMISSION_ENDPOINTS: EP } = require("../EndPoints/commission.endpoints");

// Create a new commission record
router.post(
  EP.ROUTER.CREATE_COMMISSION,
  verifyTokenOfAxios,
  validator(createCommission),
  commissionController.createCommission,
);

// Get all commission records
router.get(
  EP.ROUTER.GET_ALL_COMMISSIONS,
  verifyTokenOfAxios,
  validator(getAllCommissions, "query"),
  commissionController.getAllCommissions,
);

// Update a commission record by ID
router.put(
  EP.ROUTER.UPDATE_COMMISSION,
  verifyTokenOfAxios,
  validator(commissionIdSchema, "params"),
  validator(updateCommission),
  commissionController.updateCommission,
);

// Delete a commission record by ID
router.delete(
  EP.ROUTER.DELETE_COMMISSION,
  verifyTokenOfAxios,
  validator(commissionIdSchema, "params"),
  commissionController.deleteCommission,
);

module.exports = router;
