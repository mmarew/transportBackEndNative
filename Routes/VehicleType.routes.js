// routes/vehicleTypeRoutes.js
const express = require("express");
const router = express.Router();
const vehicleTypeController = require("../Controllers/VehicleType.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken"); // Route to create a new vehicle type
const upload = require("../Config/MulterConfig");
const checkVehicleTypeNameExists = require("../Middleware/CheckVehicleTypeNameExists");

// router.post(
//   "/api/admin/vehicleTypes",
//   verifyTokenOfAxios,
//   (req, res, next) => {
//     upload.single("vehicleTypeIconName")(req, res, function (err) {
//       if (err instanceof multer.MulterError) {
//         return res.status(400).json({ error: "Multer error: " + err.message });
//       } else if (err) {
//         return res
//           .status(400)
//           .json({ error: "File upload error: " + err.message });
//       }
//       next();
//     });
//   },
//   vehicleTypeController.createVehicleType
// );
// using memory storage
const { validator } = require("../Middleware/Validator");
const {
  createVehicleType,
  updateVehicleType,
  vehicleTypeParams,
  getVehicleTypesQuery,
} = require("../Validations/VehicleType.schema");
const { VEHICLE_TYPE_ENDPOINTS } = require("./EndPoints/vehicleType.endpoints");

// using memory storage
router.post(
  VEHICLE_TYPE_ENDPOINTS.CREATE_VEHICLE_TYPE,
  verifyTokenOfAxios,
  upload.single("vehicleTypeIconName"), // field name from frontend form-data
  validator(createVehicleType),
  checkVehicleTypeNameExists,
  vehicleTypeController.createVehicleType,
);

// Route to get all vehicle types
router.get(
  VEHICLE_TYPE_ENDPOINTS.GET_VEHICLE_TYPES,
  verifyTokenOfAxios,
  validator(getVehicleTypesQuery, "query"),
  vehicleTypeController.getVehicleTypesByfilter,
);

// Route to update a vehicle type by unique ID
router.put(
  VEHICLE_TYPE_ENDPOINTS.UPDATE_VEHICLE_TYPE,
  verifyTokenOfAxios,
  upload.single("vehicleTypeIconName"),
  // verifyTokenOfAxios, // Duplicated in original
  validator(vehicleTypeParams, "params"),
  validator(updateVehicleType),
  vehicleTypeController.updateVehicleType,
);

// Route to soft-delete a vehicle type by unique ID
router.delete(
  VEHICLE_TYPE_ENDPOINTS.DELETE_VEHICLE_TYPE,
  verifyTokenOfAxios,
  validator(vehicleTypeParams, "params"),
  vehicleTypeController.deleteVehicleType,
);

module.exports = router;
