"use strict";

const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/CompanyVehicle.controller");
const schema = require("../../Validations/CompanyVehicle.schema");
const { validator } = require("../../Middleware/Validator");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

router.use(verifyTokenOfAxios);

/**
 * @route   POST /api/company/fleet
 */
router.post("/", validator(schema.assignVehicle), controller.assignVehicle);

/**
 * @route   GET /api/company/fleet
 */
router.get(
  "/",
  validator(schema.getCompanyVehiclesQuery, "query"),
  controller.getCompanyVehicles,
);

/**
 * @route   DELETE /api/company/fleet/:companyVehicleUniqueId
 */
router.delete(
  "/:companyVehicleUniqueId",
  validator(schema.companyVehicleParams, "params"),
  controller.removeVehicle,
);

module.exports = router;
