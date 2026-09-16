const express = require("express");
const router = express.Router();
const subscriptionPlanController = require("../../Controllers/SubscriptionPlan.controller");
const { verifyTokenOfAxios } = require("../../Middleware/VerifyToken");

const { validator } = require("../../Middleware/Validator");
const {
  createSubscriptionPlan,
  updateSubscriptionPlan,
  subscriptionPlanParams,
  getSubscriptionPlansQuery,
} = require("../../Validations/SubscriptionPlan.schema");
const { SUBSCRIPTION_PLAN_ENDPOINTS: EP } = require("../EndPoints/subscriptionPlan.endpoints");

// Create
router.post(
  EP.ROUTER.CREATE_SUBSCRIPTION_PLAN,
  verifyTokenOfAxios,
  validator(createSubscriptionPlan),
  subscriptionPlanController.createSubscriptionPlan,
);

// Single GET endpoint with filters (plan only, no pricing)
router.get(
  EP.ROUTER.GET_ALL_SUBSCRIPTION_PLANS,
  verifyTokenOfAxios,
  validator(getSubscriptionPlansQuery, "query"),
  subscriptionPlanController.getSubscriptionPlans,
);

// Update by uniqueId
router.put(
  EP.ROUTER.UPDATE_SUBSCRIPTION_PLAN,
  verifyTokenOfAxios,
  validator(subscriptionPlanParams, "params"),
  validator(updateSubscriptionPlan),
  subscriptionPlanController.updateSubscriptionPlan,
);

// Delete by uniqueId
router.delete(
  EP.ROUTER.DELETE_SUBSCRIPTION_PLAN,
  verifyTokenOfAxios,
  validator(subscriptionPlanParams, "params"),
  subscriptionPlanController.deleteSubscriptionPlan,
);

module.exports = router;
