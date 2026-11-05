const subscriptionPlanService = require("../Services/SubscriptionPlan.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.createSubscriptionPlan = async (req, res, next) => {
  try {
    const { planName, description, isFree, durationInDays } = req.body;
    const result = await executeInTransaction(async () => {
      return await subscriptionPlanService.createSubscriptionPlan({
        planName,
        description,
        isFree,
        durationInDays,
        user: req.user,
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Single GET endpoint for subscription plans only
exports.getSubscriptionPlans = async (req, res, next) => {
  try {
    const {
      subscriptionPlanUniqueId, // For getting specific plan
      planName,
      isFree,
      page = 1,
      limit = 10,
      sortBy = "subscriptionPlanCreatedAt",
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
    next(error);
  }
};

exports.updateSubscriptionPlan = async (req, res, next) => {
  try {
    const { uniqueId } = req.params;
    const { planName, description, isFree, durationInDays } = req.body;
    const updatedBy = req.user?.userUniqueId;
    const result = await executeInTransaction(async () => {
      return await subscriptionPlanService.updateSubscriptionPlan(
        uniqueId,
        planName,
        description,
        isFree,
        durationInDays,
        updatedBy,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.deleteSubscriptionPlan = async (req, res, next) => {
  try {
    const { uniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await subscriptionPlanService.deleteSubscriptionPlan(uniqueId);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
