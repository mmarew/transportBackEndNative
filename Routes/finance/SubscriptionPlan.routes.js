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

// Create
router.post(
  "/",
  verifyTokenOfAxios,
  validator(createSubscriptionPlan),
  subscriptionPlanController.createSubscriptionPlan,
);

// Single GET endpoint with filters (plan only, no pricing)
router.get(
  "/",
  verifyTokenOfAxios,
  validator(getSubscriptionPlansQuery, "query"),
  subscriptionPlanController.getSubscriptionPlans,
);

// Update by uniqueId
router.put(
  "/:uniqueId",
  verifyTokenOfAxios,
  validator(subscriptionPlanParams, "params"),
  validator(updateSubscriptionPlan),
  subscriptionPlanController.updateSubscriptionPlan,
);

// Delete by uniqueId
router.delete(
  "/:uniqueId",
  verifyTokenOfAxios,
  validator(subscriptionPlanParams, "params"),
  subscriptionPlanController.deleteSubscriptionPlan,
);

module.exports = router;
