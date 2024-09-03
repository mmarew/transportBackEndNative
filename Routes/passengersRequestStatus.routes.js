const express = require("express");
const {
  registerPassengersRequestStatusController,
  getPassengersRequestStatusController,
  updatePassengersRequestStatusController,
  deletePassengersRequestStatusController,
  getAllPassengersRequestStatusController,
} = require("../controllers/passengersRequestStatus.controller");

const router = express.Router();

router.post(
  "/api/admin/registerPassengersRequestStatus",
  registerPassengersRequestStatusController
);
router.get(
  "/api/admin/getAllPassengersRequestStatus",
  getAllPassengersRequestStatusController
); // Add the new route

router.get(
  "/api/admin/getPassengersRequestStatus/:id",
  getPassengersRequestStatusController
);
router.put(
  "/api/admin/updatePassengersRequestStatus/:id",
  updatePassengersRequestStatusController
);
router.delete(
  "/api/admin/deletePassengersRequestStatus/:id",
  deletePassengersRequestStatusController
);

module.exports = router;
