// const express = require("express");
// const router = express.Router();
// const controller = require("../Controllers/FreeGiftToDriver.controller");
// const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// // Create a free gift for a driver
// router.post(
//   "/api/freeGiftToDriver/:driverUniqueId",
//   verifyTokenOfAxios,
//   controller.createFreeGiftToDriver
// );

// // Get all free gifts
// router.get(
//   "/api/freeGiftToDriver",
//   verifyTokenOfAxios,
//   controller.getAllFreeGiftToDrivers
// );

// // Get gift by unique ID
// router.get(
//   "/api/freeGiftToDriver/:freeGiftUniqueId",
//   verifyTokenOfAxios,
//   controller.getFreeGiftToDriverByUniqueId
// );

// // Get gifts by driver
// router.get(
//   "/api/freeGiftToDriver/driver/:driverUniqueId",
//   verifyTokenOfAxios,
//   controller.getFreeGiftToDriverByDriverId
// );
// router.get(
//   "/api/freeGiftToDriver/plan/:subscriptionPlanUniqueId/driver/:driverUniqueId",
//   verifyTokenOfAxios,
//   controller.getFreeGiftToDriverByPlanUniqueIdAndDriverUniqueId
// );
// // Delete gift
// router.delete(
//   "/api/freeGiftToDriver/:freeGiftUniqueId",
//   verifyTokenOfAxios,
//   controller.deleteFreeGiftToDriverByUniqueId
// );
// router.put(
//   "/api/freeGiftToDriver/:freeGiftUniqueId",
//   verifyTokenOfAxios,
//   controller.updateFreeGiftToDriverByUniqueId
// );

// module.exports = router;
const express = require("express");
const router = express.Router();
const controller = require("../Controllers/FreeGiftToDriver.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Single consolidated GET endpoint with filtering
router.get(
  "/api/getFreeGiftToDriversWithFilters",
  verifyTokenOfAxios,
  controller.getFreeGiftToDriversWithFilters
);

// Create a free gift for a driver
router.post(
  "/api/freeGiftToDriver/:driverUniqueId",
  verifyTokenOfAxios,
  controller.createFreeGiftToDriver
);

// Delete gift
router.delete(
  "/api/freeGiftToDriver/:freeGiftUniqueId",
  verifyTokenOfAxios,
  controller.deleteFreeGiftToDriverByUniqueId
);

// Update gift
router.put(
  "/api/freeGiftToDriver/:freeGiftUniqueId",
  verifyTokenOfAxios,
  controller.updateFreeGiftToDriverByUniqueId
);

module.exports = router;
