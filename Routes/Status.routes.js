const express = require("express");
const {
  createStatusController,
  updateStatusController,
  deleteStatusController,
  getAllStatusesController,
} = require("../Controllers/Status.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

const router = express.Router();

// Define CRUD routes
const { validator } = require("../Middleware/Validator");
const {
  createStatus,
  updateStatus,
  statusParams,
  getStatusesQuery,
} = require("../Validations/Status.schema");
const { STATUS_ENDPOINTS } = require("./EndPoints/status.endpoints");

// Define CRUD routes
router.post(
  STATUS_ENDPOINTS.CREATE_STATUS,
  verifyTokenOfAxios,
  validator(createStatus),
  createStatusController,
); // Create a new status

router.put(
  STATUS_ENDPOINTS.UPDATE_STATUS,
  verifyTokenOfAxios,
  validator(statusParams, "params"),
  validator(updateStatus),
  updateStatusController,
); // Update a status by ID

router.delete(
  STATUS_ENDPOINTS.DELETE_STATUS,
  verifyTokenOfAxios,
  validator(statusParams, "params"),
  deleteStatusController,
); // Delete a status by ID

router.get(
  STATUS_ENDPOINTS.GET_ALL_STATUSES,
  verifyTokenOfAxios,
  validator(getStatusesQuery, "query"),
  getAllStatusesController,
); // Get all statuses with pagination and search

module.exports = router;
