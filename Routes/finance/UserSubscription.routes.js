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
const { USER_SUBSCRIPTION_ENDPOINTS: EP } = require("../EndPoints/userSubscription.endpoints");

// Create subscription
router.post(
  EP.ROUTER.CREATE_USER_SUBSCRIPTION,
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
  EP.ROUTER.GET_ALL_USER_SUBSCRIPTIONS,
  verifyTokenOfAxios,
  validator(userSubscriptionGetParams, "params"),
  validator(getUserSubscriptionsQuery, "query"),
  controller.getUserSubscriptions,
);

// Update by UUID
router.put(
  EP.ROUTER.UPDATE_USER_SUBSCRIPTION,
  verifyTokenOfAxios,
  validator(userSubscriptionUuidParams, "params"),
  validator(updateUserSubscription),
  controller.updateUserSubscriptionByUniqueId,
);

// Delete by UUID
router.delete(
  EP.ROUTER.DELETE_USER_SUBSCRIPTION,
  verifyTokenOfAxios,
  validator(userSubscriptionUuidParams, "params"),
  controller.deleteUserSubscriptionByUniqueId,
);

module.exports = router;
