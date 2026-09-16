const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/DepositSource.controller");
const {
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
} = require("../../Middleware/VerifyToken");

// Create new source
const { validator } = require("../../Middleware/Validator");
const {
  createDepositSource,
  updateDepositSource,
  depositSourceParams,
} = require("../../Validations/DepositSource.schema");
const { DEPOSIT_SOURCE_ENDPOINTS: EP } = require("../EndPoints/depositSource.endpoints");

// Create new source
router.post(
  EP.ROUTER.CREATE_DEPOSIT_SOURCE,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(createDepositSource),
  controller.createDepositSource,
);

// Get all sources
router.get(
  EP.ROUTER.GET_ALL_DEPOSIT_SOURCES,
  verifyTokenOfAxios,
  controller.getAllDepositSources,
);

// Get by UUID
router.get(
  EP.ROUTER.GET_DEPOSIT_SOURCE_BY_UNIQUE_ID,
  verifyTokenOfAxios,
  validator(depositSourceParams, "params"),
  controller.getDepositSourceByUniqueId,
);

// Update by UUID
router.put(
  EP.ROUTER.UPDATE_DEPOSIT_SOURCE,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(depositSourceParams, "params"),
  validator(updateDepositSource),
  controller.updateDepositSourceByUniqueId,
);

// Delete by UUID
router.delete(
  EP.ROUTER.DELETE_DEPOSIT_SOURCE,
  verifyTokenOfAxios,
  verifyIfUserIsAdminOrSupperAdmin,
  validator(depositSourceParams, "params"),
  controller.deleteDepositSourceByUniqueId,
);

module.exports = router;
