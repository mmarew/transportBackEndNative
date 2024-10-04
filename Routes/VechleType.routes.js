// routes/vehicleTypeRoutes.js
const express = require("express");
const {
  registerVehicleTypeController,
  getVehicleTypeController,
  updateVehicleTypeController,
  deleteVehicleTypeController,
  getAllVehicleTypesController,
} = require("../controllers/VechleType.controller");
const upload = require("../Config/multerConfig");

const router = express.Router();

router.post(
  "/api/admin/registerVehicleType",
  upload.single("vehicleImage"),
  registerVehicleTypeController
);
router.get("/api/admin/getVehicleType/:id", getVehicleTypeController);
router.put("/api/admin/updateVehicleType/:id", updateVehicleTypeController);
router.delete("/api/admin/deleteVehicleType/:id", deleteVehicleTypeController);
router.get("/api/user/getAllVehicleTypes", getAllVehicleTypesController);

module.exports = router;
