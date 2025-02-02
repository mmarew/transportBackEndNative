const express = require("express");
const router = express.Router();
const userStatusesController = require("../Controllers/UserStatuse.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Routes for CRUD operations
router.post(
  "/userStatuses/create",
  verifyTokenOfAxios,
  userStatusesController.createUserStatus
);
router.get(
  "/userStatuses/:id",
  verifyTokenOfAxios,
  userStatusesController.getUserStatusById
);
router.put(
  "/userStatuses/:id",
  verifyTokenOfAxios,
  userStatusesController.updateUserStatus
);
router.delete(
  "/userStatuses/:id",
  verifyTokenOfAxios,
  userStatusesController.deleteUserStatus
);

module.exports = router;
