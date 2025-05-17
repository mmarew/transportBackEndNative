const subscriptionPlanService = require("../Services/SubscriptionPlan.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createSubscriptionPlan = async (req, res) => {
  try {
    const { planName, description, isTrial } = req.body;
    const result = await subscriptionPlanService.createSubscriptionPlan(
      planName,
      description,
      isTrial
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error creating subscription plan:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create subscription plan",
    });
  }
};

exports.getAllSubscriptionPlans = async (req, res) => {
  try {
    const result = await subscriptionPlanService.getAllSubscriptionPlans();
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscription plans:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscription plans",
    });
  }
};

exports.getSubscriptionPlanByUniqueId = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const result = await subscriptionPlanService.getSubscriptionPlanByUniqueId(
      uniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscription plan",
    });
  }
};

exports.updateSubscriptionPlan = async (req, res) => {
  try {
    const { uniqueId } = req.params;
    const { planName, description, isTrial } = req.body;
    const result = await subscriptionPlanService.updateSubscriptionPlan(
      uniqueId,
      planName,
      description,
      isTrial
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
