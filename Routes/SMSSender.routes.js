const express = require("express");
const router = express.Router();
const smsSenderController = require("../Controllers/smsSender.controller");

// Create a new SMS sender
router.post("/smsSender", smsSenderController.createSMSSender);

// Get all SMS senders
router.get("/smsSender", smsSenderController.getAllSMSSenders);

// Get a single SMS sender by ID
router.get("/smsSender/:id", smsSenderController.getSMSSenderById);

// Update an SMS sender by ID
router.put("/smsSender/:id", smsSenderController.updateSMSSender);

// Delete an SMS sender by ID
router.delete("/smsSender/:id", smsSenderController.deleteSMSSender);

module.exports = router;
