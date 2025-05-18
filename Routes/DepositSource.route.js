const express = require("express");
const router = express.Router();
const controller = require("../Controllers/DepositSource.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

// Create new source
router.post(
  "/api/depositSource",
  verifyTokenOfAxios,
  controller.createDepositSource
);

// Get all sources
router.get(
  "/api/depositSource",
  verifyTokenOfAxios,
  controller.getAllDepositSources
);

// Get by UUID
router.get(
  "/api/depositSource/:depositSourceUniqueId",
  verifyTokenOfAxios,
  controller.getDepositSourceByUniqueId
);

// Update by UUID
router.put(
  "/api/depositSource/:depositSourceUniqueId",
  verifyTokenOfAxios,
  controller.updateDepositSourceByUniqueId
);

// Delete by UUID
router.delete(
  "/api/depositSource/:depositSourceUniqueId",
  verifyTokenOfAxios,
  controller.deleteDepositSourceByUniqueId
);

module.exports = router;
