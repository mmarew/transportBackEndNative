const express = require("express");
const verifyToken = require("../Middleware/verifyToken");
const {
  acceptPassengerRequest,
  deleteRequestController,
} = require("../controllers/requests.controller");
const controller = require("../controllers/requests.controller");
const router = express.Router();
router.post(
  "/api/request/createRequest",
  verifyToken.verifyTokenOfAxios,
  controller.createRequest
);
router.put(
  "/api/request/acceptPassengerRequest",
  verifyToken.verifyTokenOfAxios,
  acceptPassengerRequest
);
router.put(
  "/startJourney",
  verifyToken.verifyTokenOfAxios,
  controller.startJourney
);
router.put(
  "/api/request/journeyCompleted",
  verifyToken.verifyTokenOfAxios,
  controller.journeyCompleted
);

router.get(
  "/api/request/verifyStatusOfUser",
  verifyToken.verifyTokenOfAxios,
  controller.verifyStatusOfUser
);
router.get("/api/request/:id", controller.getRequestController);
// router.put("/requests/:id", updateRequestController);
router.put("/api/request/cancelRequest", controller.cancelRequest);
router.delete("/request/:id", deleteRequestController);

module.exports = router;
