const express = require("express");
const router = express.Router();
const deliveryConfirmationController = require("../Controllers/DeliveryConfirmation.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const upload = require("../Config/MulterConfig");

const { validator } = require("../Middleware/Validator");
const {
  createDeliveryConfirmation,
  updateDeliveryConfirmation,
  deliveryConfirmationParams,
  getDeliveryConfirmationsQuery,
} = require("../Validations/DeliveryConfirmation.schema");
const {
  DELIVERY_CONFIRMATION_ENDPOINTS,
} = require("./EndPoints/deliveryConfirmation.endpoints");

// Create a new delivery confirmation (multipart: optional "photo" file + fields)
router.post(
  DELIVERY_CONFIRMATION_ENDPOINTS.CREATE_DELIVERY_CONFIRMATION,
  verifyTokenOfAxios,
  upload.single("photo"),
  validator(createDeliveryConfirmation),
  deliveryConfirmationController.createDeliveryConfirmation,
);

// Get delivery confirmations by filters (id, journey, receiver, status) with pagination
router.get(
  DELIVERY_CONFIRMATION_ENDPOINTS.GET_ALL_DELIVERY_CONFIRMATIONS,
  verifyTokenOfAxios,
  validator(getDeliveryConfirmationsQuery, "query"),
  deliveryConfirmationController.getDeliveryConfirmations,
);

// Update a delivery confirmation by deliveryConfirmationUniqueId (multipart optional "photo")
router.put(
  DELIVERY_CONFIRMATION_ENDPOINTS.UPDATE_DELIVERY_CONFIRMATION,
  verifyTokenOfAxios,
  upload.single("photo"),
  validator(deliveryConfirmationParams, "params"),
  validator(updateDeliveryConfirmation),
  deliveryConfirmationController.updateDeliveryConfirmation,
);

// Delete a delivery confirmation by deliveryConfirmationUniqueId
router.delete(
  DELIVERY_CONFIRMATION_ENDPOINTS.DELETE_DELIVERY_CONFIRMATION,
  verifyTokenOfAxios,
  validator(deliveryConfirmationParams, "params"),
  deliveryConfirmationController.deleteDeliveryConfirmation,
);

module.exports = router;
