// routes/vehicleTypeRoutes.js
const express = require("express");
const router = express.Router();
const vehicleTypeController = require("../Controllers/VehicleType.controller");
const upload = require("../Config/MulterConfig");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken"); // Route to create a new vehicle type
const multer = require("multer");

router.post(
  "/api/admin/vehicleTypes",
  verifyTokenOfAxios,
  (req, res, next) => {
    upload.single("vehicleTypeIconName")(req, res, function (err) {
      console.log("req.body", req.body);
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: "Multer error: " + err.message });
      } else if (err) {
        return res
          .status(400)
          .json({ error: "File upload error: " + err.message });
      }
      next();
    });
  },
  vehicleTypeController.createVehicleType
);

// Route to get all vehicle types
router.get(
  "/api/admin/vehicleTypes",
  verifyTokenOfAxios,
  vehicleTypeController.getAllVehicleTypes
);

// Route to get a vehicle type by unique ID
router.get(
  "/api/admin/vehicleTypes/:vehicleTypeUniqueId",
  verifyTokenOfAxios,

  vehicleTypeController.getVehicleTypeByUniqueId
);

// Route to update a vehicle type by unique ID
router.put(
  "/api/admin/vehicleTypes/:uniqueId",
  verifyTokenOfAxios,

  upload.single("vehicleTypeIconName"),
  verifyTokenOfAxios,

  vehicleTypeController.updateVehicleType
);

// Route to soft-delete a vehicle type by unique ID
router.delete(
  "/api/admin/vehicleTypes/:uniqueId",
  verifyTokenOfAxios,

  vehicleTypeController.deleteVehicleType
);

module.exports = router;
