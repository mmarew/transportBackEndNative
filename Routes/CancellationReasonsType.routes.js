const express = require("express");
const {
  addCancellationReasons,
  deleteCancellationReasons,
  updateCancellationReasons,
  getAllCancellationReasons,
} = require("../Controllers/Cancellation.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const Router = express.Router();

const { validator } = require("../Middleware/Validator");
const {
  createCancellationReason,
  updateCancellationReason,
  cancellationReasonParams,
  getCancellationReasonsQuery,
} = require("../Validations/CancellationReasons.schema");
const { CANCELLATION_REASONS_TYPE_ENDPOINTS } = require("./utils/cancellationReasonsType.utils");

Router.post(
  CANCELLATION_REASONS_TYPE_ENDPOINTS.ADD_CANCELLATION_REASONS,
  verifyTokenOfAxios,
  validator(createCancellationReason),
  addCancellationReasons,
);

Router.get(
  CANCELLATION_REASONS_TYPE_ENDPOINTS.GET_ALL_CANCELLATION_REASONS,
  verifyTokenOfAxios,
  validator(getCancellationReasonsQuery, "query"),
  getAllCancellationReasons,
);

Router.put(
  CANCELLATION_REASONS_TYPE_ENDPOINTS.UPDATE_CANCELLATION_REASONS,
  verifyTokenOfAxios,
  validator(cancellationReasonParams, "params"),
  validator(updateCancellationReason),
  updateCancellationReasons,
);

Router.delete(
  CANCELLATION_REASONS_TYPE_ENDPOINTS.DELETE_CANCELLATION_REASONS,
  verifyTokenOfAxios,
  validator(cancellationReasonParams, "params"),
  deleteCancellationReasons,
);
module.exports = Router;
