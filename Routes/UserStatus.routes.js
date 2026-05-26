const express = require("express");
const router = express.Router();
const userStatusesController = require("../Controllers/UserStatus.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Routes for CRUD operations
const { validator } = require("../Middleware/Validator");
const {
  createUserStatus,
  updateUserStatus,
  userStatusParams,
} = require("../Validations/UserStatus.schema");
const { USER_STATUS_ENDPOINTS } = require("./EndPoints/userStatus.endpoints");

// Routes for CRUD operations
router.post(
  USER_STATUS_ENDPOINTS.CREATE_USER_STATUS,
  verifyTokenOfAxios,
  validator(createUserStatus),
  userStatusesController.createUserStatus,
);
router.get(
  USER_STATUS_ENDPOINTS.GET_USER_STATUS_BY_ID,
  verifyTokenOfAxios,
  validator(userStatusParams, "params"),
  userStatusesController.getUserStatusById,
);
router.put(
  USER_STATUS_ENDPOINTS.UPDATE_USER_STATUS,
  verifyTokenOfAxios,
  validator(userStatusParams, "params"),
  validator(updateUserStatus),
  userStatusesController.updateUserStatus,
);
router.delete(
  USER_STATUS_ENDPOINTS.DELETE_USER_STATUS,
  verifyTokenOfAxios,
  validator(userStatusParams, "params"),
  userStatusesController.deleteUserStatus,
);

module.exports = router;
