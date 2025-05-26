const express = require("express");
const router = express.Router();
const controller = require("../Controllers/FreeGiftToDriver.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create Free Gift
router.post(
  "/api/freeGiftToDriver/:driverUniqueId",
  verifyTokenOfAxios,
  controller.createFreeGiftToDriver
);

// Get all Free Gifts
router.get(
  "/api/freeGiftToDriver",
  verifyTokenOfAxios,
  controller.getAllFreeGiftToDrivers
);

// Get by UniqueId
router.get(
  "/api/freeGiftToDriver/:freeGiftUniqueId",
  verifyTokenOfAxios,
  controller.getFreeGiftToDriverByUniqueId
);

// Get gifts by driverUniqueId
router.get(
  "/api/freeGiftToDriver/driver/:driverUniqueId",
  verifyTokenOfAxios,
  controller.getFreeGiftToDriverByDriverId
);

// Delete
router.delete(
  "/api/freeGiftToDriver/:freeGiftUniqueId",
  verifyTokenOfAxios,
  controller.deleteFreeGiftToDriverByUniqueId
);

module.exports = router;
