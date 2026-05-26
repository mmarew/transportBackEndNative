const express = require("express");
const router = express.Router();
const smsSenderController = require("../Controllers/SmsSender.controller");

// Create a new SMS sender
const { validator } = require("../Middleware/Validator");
const {
  createSMSSender,
  smsSenderParams,
} = require("../Validations/SMSSender.schema");
const { SMS_SENDER_ENDPOINTS } = require("./utils/smsSender.utils");

// Create a new SMS sender
router.post(
  SMS_SENDER_ENDPOINTS.CREATE_SMS_SENDER,
  validator(createSMSSender),
  smsSenderController.createSMSSender,
);

// Get all SMS senders
router.get(SMS_SENDER_ENDPOINTS.GET_ALL_SMS_SENDERS, smsSenderController.getAllSMSSenders);

// Get a single SMS sender by ID
router.get(
  SMS_SENDER_ENDPOINTS.GET_SMS_SENDER_BY_ID,
  validator(smsSenderParams, "params"),
  smsSenderController.getSMSSenderById,
);

// Update an SMS sender by ID
router.put(
  SMS_SENDER_ENDPOINTS.UPDATE_SMS_SENDER,
  validator(smsSenderParams, "params"),
  validator(updateSMSSender),
  smsSenderController.updateSMSSender,
);

// Delete an SMS sender by ID
router.delete(
  SMS_SENDER_ENDPOINTS.DELETE_SMS_SENDER,
  validator(smsSenderParams, "params"),
  smsSenderController.deleteSMSSender,
);

module.exports = router;
