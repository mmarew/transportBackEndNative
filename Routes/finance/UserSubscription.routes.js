const express = require("express");
const router = express.Router();
const controller = require("../../Controllers/UserSubscription.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createUserSubscription,
  updateUserSubscription,
  userSubscriptionParams,
  userSubscriptionGetParams,
  userSubscriptionUuidParams,
  getUserSubscriptionsQuery,
} = require("../../Validations/UserSubscription.schema");

// Create subscription
router.post(
  "/:driverUniqueId",
  verifyTokenOfAxios,
  validator(userSubscriptionParams, "params"),
  validator(createUserSubscription),
  controller.createUserSubscription,
);

// Unified GET endpoint - handles all filtering, by driverUniqueId, and 'self'
// Supports: /api/finance/userSubscription?driverUniqueId=self&isActive=true
//           /api/finance/userSubscription?userSubscriptionUniqueId=uuid
//           /api/finance/userSubscription?driverUniqueId=uuid&isActive=true
router.get(
  "/",
  verifyTokenOfAxios,
  validator(userSubscriptionGetParams, "params"),
  validator(getUserSubscriptionsQuery, "query"),
  controller.getUserSubscriptions,
);

// Update by UUID
router.put(
  "/:userSubscriptionUniqueId",
  verifyTokenOfAxios,
  validator(userSubscriptionUuidParams, "params"),
  validator(updateUserSubscription),
  controller.updateUserSubscriptionByUniqueId,
);

// Delete by UUID
router.delete(
  "/:userSubscriptionUniqueId",
  verifyTokenOfAxios,
  validator(userSubscriptionUuidParams, "params"),
  controller.deleteUserSubscriptionByUniqueId,
);

module.exports = router;
