const express = require("express");
const router = express.Router();
const commissionStatusController = require("../../Controllers/CommissionStatus.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createCommissionStatus,
  updateCommissionStatus,
  getAllCommissionStatuses,
} = require("../../Validations/CommissionStatus.schema");
const { COMMISSION_STATUS_ENDPOINTS: EP } = require("../EndPoints/commissionStatus.endpoints");

// Create
router.post(
  EP.ROUTER.CREATE_COMMISSION_STATUS,
  verifyTokenOfAxios,
  validator(createCommissionStatus),
  commissionStatusController.createCommissionStatus,
);

// Get all (with filters)
router.get(
  EP.ROUTER.GET_ALL_COMMISSION_STATUSES,
  verifyTokenOfAxios,
  validator(getAllCommissionStatuses, "query"),
  commissionStatusController.getAllCommissionStatuses,
);

// Update
router.put(
  EP.ROUTER.UPDATE_COMMISSION_STATUS,
  verifyTokenOfAxios,
  validator(updateCommissionStatus),
  commissionStatusController.updateCommissionStatus,
);

// Delete
router.delete(
  EP.ROUTER.DELETE_COMMISSION_STATUS,
  verifyTokenOfAxios,
  validator(updateCommissionStatus),
  commissionStatusController.deleteCommissionStatus,
);

module.exports = router;
