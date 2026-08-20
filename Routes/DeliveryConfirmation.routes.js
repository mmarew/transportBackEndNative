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
  submitReceiptConfirmation,
} = require("../Validations/DeliveryConfirmation.schema");
const {
  DELIVERY_CONFIRMATION_ENDPOINTS,
} = require("./EndPoints/deliveryConfirmation.endpoints");

// Create a new delivery confirmation (multipart: optional "photos" file array +
// fields; legacy single "photo" field still accepted and becomes the primary).
router.post(
  DELIVERY_CONFIRMATION_ENDPOINTS.CREATE_DELIVERY_CONFIRMATION,
  verifyTokenOfAxios,
  upload.fields([
    { name: "photos", maxCount: 10 },
    { name: "photo", maxCount: 1 },
  ]),
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

// Update a delivery confirmation by deliveryConfirmationUniqueId (multipart:
// optional "photos" file array; legacy single "photo" field still accepted).
router.put(
  DELIVERY_CONFIRMATION_ENDPOINTS.UPDATE_DELIVERY_CONFIRMATION,
  verifyTokenOfAxios,
  upload.fields([
    { name: "photos", maxCount: 10 },
    { name: "photo", maxCount: 1 },
  ]),
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

// Tier A: request a time-limited OTP for the on-road receiver signature.
// Only while the confirmation is PENDING; at most one active code at a time.
router.post(
  DELIVERY_CONFIRMATION_ENDPOINTS.REQUEST_SIGN_OTP,
  verifyTokenOfAxios,
  validator(deliveryConfirmationParams, "params"),
  deliveryConfirmationController.requestSignOtp,
);

// Admin tool: recompute the settle hash and compare with the stored hash
router.get(
  DELIVERY_CONFIRMATION_ENDPOINTS.VERIFY_HASH,
  verifyTokenOfAxios,
  validator(deliveryConfirmationParams, "params"),
  deliveryConfirmationController.verifyDeliveryConfirmationHash,
);

/**
 * POST /receipt
 *
 * Submit receipt photos for a receipt-required journey. The confirmation is
 * auto-confirmed immediately (no shipper review). Placed after static routes
 * but before param routes to avoid matching "receipt" as a UUID.
 *
 * @route POST /api/deliveryConfirmations/receipt
 * @summary Submit receipt photos (auto-confirmed immediately)
 * @access Driver (journey owner)
 * @contentType multipart/form-data
 * @param {File[]} photos - Receipt images (1–20 files, field name "photos")
 * @param {string} body.journeyUniqueId - UUID of the completed journey
 * @param {string} [body.notes] - Free-text delivery notes
 * @param {number} [body.latitude] - GPS latitude at submission
 * @param {number} [body.longitude] - GPS longitude at submission
 * @param {number} [body.deliveredQuantity] - Quantity delivered
 * @param {string} [body.quantityUnit] - Unit of delivered quantity
 * @param {string} [body.condition] - Condition of goods (default: GOOD)
 */
router.post(
  DELIVERY_CONFIRMATION_ENDPOINTS.SUBMIT_RECEIPT,
  verifyTokenOfAxios,
  upload.fields([{ name: "photos", maxCount: 20 }]),
  validator(submitReceiptConfirmation),
  deliveryConfirmationController.submitReceiptPhotos,
);

module.exports = router;
