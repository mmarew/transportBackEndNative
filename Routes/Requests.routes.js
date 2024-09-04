const express = require("express");
const verifyToken = require("../Middleware/verifyToken");
const {
  createRequestController,
  getRequestController,
  updateRequestController,
  deleteRequestController,
} = require("../controllers/requests.controller");
const controller = require("../controllers/requests.controller");
const router = express.Router();

router.post(
  "/requests",
  verifyToken.verifyTokenOfAxios,
  createRequestController
);
router.get(
  "/verifyStatusOfUser",
  verifyToken.verifyTokenOfAxios,
  controller.verifyStatusOfUser
);
router.get("/requests/:id", getRequestController);
router.put("/requests/:id", updateRequestController);
router.delete("/requests/:id", deleteRequestController);

module.exports = router;
