// routes/userRoutes.js
const express = require("express");
const controller = require("../Controllers/User");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const {
  verifyIfOperationIsAllowedByUserDriver,
} = require("../Middleware/VerifyUsersIdentity");
const { USER_ENDPOINTS } = require("./EndPoints/user.endpoints");
const upload = require("../Config/MulterConfig");

const { validator } = require("../Middleware/Validator");

const {
  updateUser,
  userIdParams,
  ownerUserIdParams,
  getUserFilter,
} = require("../Validations/User.schema");

const router = express.Router();

router.put(
  USER_ENDPOINTS.UPDATE_USER,
  verifyTokenOfAxios,
  verifyIfOperationIsAllowedByUserDriver,
  upload.any(),
  validator(ownerUserIdParams, "params"),
  validator(updateUser), // Body validation (note: might conflict with multipart/form-data if not handled carefully, typically Joi runs on req.body which multer populates)
  controller.updateUser,
);

router.delete(
  USER_ENDPOINTS.GET_USER_BY_ID,
  verifyTokenOfAxios,
  validator(userIdParams, "params"),
  controller.deleteUser,
);

router.get(
  USER_ENDPOINTS.GET_USER_BY_FILTER_DETAILED,
  verifyTokenOfAxios,
  validator(getUserFilter, "query"),
  controller.getUserByFilterDetailed,
);

/**
 * @route   GET /api/user/users/:userUniqueId/profileHistory
 * @desc    Audit log of user PROFILE changes only (fullName, phone, email).
 *          NOT journey/job history — separate concern.
 *          One row per field per event, newest first.
 * @access  Private (Admin or the user themselves)
 * @query   page?, limit?, fieldName? (e.g. 'phoneNumber'), source? (e.g. 'profile_update')
 */
router.get(
  USER_ENDPOINTS.GET_USER_PROFILE_HISTORY,
  verifyTokenOfAxios,
  validator(userIdParams, "params"),
  controller.getUserProfileHistory,
);

module.exports = router;
