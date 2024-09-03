// routes/vehicleTypeRoutes.js
const express = require("express");
const {
  registerVehicleTypeController,
  getVehicleTypeController,
  updateVehicleTypeController,
  deleteVehicleTypeController,
  getAllVehicleTypesController,
} = require("../controllers/VechleType.controller");

const router = express.Router();

router.post("/api/admin/registerVehicleType", registerVehicleTypeController);
router.get("/api/admin/getVehicleType/:id", getVehicleTypeController);
router.put("/api/admin/updateVehicleType/:id", updateVehicleTypeController);
router.delete("/api/admin/deleteVehicleType/:id", deleteVehicleTypeController);
router.get("/api/admin/getAllVehicleTypes", getAllVehicleTypesController);

module.exports = router;
