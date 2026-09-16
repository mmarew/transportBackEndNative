"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyVehicle.controller");
const schema = require("../../Validations/CompanyVehicle.schema");
const { validator } = require("../../Middleware/Validator");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");
const { COMPANY_VEHICLE_ENDPOINTS: EP } = require("../EndPoints/companyVehicle.endpoints");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/fleet
 */
router.post(EP.ROUTER.ASSIGN_VEHICLE, validator(schema.assignVehicle), controller.assignVehicle);

/**
 * @route   GET /api/company/fleet
 */
router.get(
  EP.ROUTER.GET_COMPANY_VEHICLES,
  validator(schema.getCompanyVehiclesQuery, "query"),
  controller.getCompanyVehicles,
);

/**
 * @route   PUT /api/company/fleet?userUniqueId=self
 */
router.put(EP.ROUTER.MOVE_VEHICLE, validator(schema.moveVehicle), controller.moveVehicle);

/**
 * @route   DELETE /api/company/fleet/:companyVehicleUniqueId
 */
router.delete(
  EP.ROUTER.REMOVE_VEHICLE,
  validator(schema.companyVehicleParams, "params"),
  controller.removeVehicle,
);

module.exports = router;
