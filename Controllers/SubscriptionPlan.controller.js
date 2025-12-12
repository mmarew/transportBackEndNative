const subscriptionPlanService = require("../Services/SubscriptionPlan.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createSubscriptionPlan = async (req, res) => {
  try {
    const { planName, description, isFree } = req.body;
    const result = await subscriptionPlanService.createSubscriptionPlan({
      planName,
      description,
      isFree,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error creating subscription plan:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create subscription plan",
    });
  }
};

// Single GET endpoint for subscription plans only
exports.getSubscriptionPlans = async (req, res) => {
  try {
    const {
      subscriptionPlanUniqueId, // For getting specific plan
      planName,
      isFree,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "DESC",
    } = req.query;

    // Build filter object
    const filters = {
      subscriptionPlanUniqueId,
      planName,
      isFree: isFree ? isFree === "true" : undefined,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
    };

    // Remove undefined filters
    Object.keys(filters).forEach((key) => {
      if (filters[key] === undefined || filters[key] === "") {
        delete filters[key];
      }
    });

    const result = await subscriptionPlanService.getSubscriptionPlans(filters);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscription plans",
    });
  }
};

exports.updateSubscriptionPlan = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { planName, description, isFree } = req.body;
    const result = await subscriptionPlanService.updateSubscriptionPlan(
      uniqueId,
      planName,
      description,
      isFree
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error updating subscription plan:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update subscription plan",
    });
  }
};

exports.deleteSubscriptionPlan = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const result = await subscriptionPlanService.deleteSubscriptionPlan(
      uniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error deleting subscription plan:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete subscription plan",
    });
  }
};
