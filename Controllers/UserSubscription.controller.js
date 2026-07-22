const service = require("../Services/UserSubscription");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create
exports.createUserSubscription = async (req, res, next) => {
  try {
    const { subscriptionPlanPricingUniqueId, startDate, endDate } = req.body;
    const user = req.user;

    let driverUniqueId = req?.params?.driverUniqueId;
    if (driverUniqueId === "self") {
      driverUniqueId = user?.userUniqueId;
    }

    const result = await executeInTransaction(async () => {
      return await service.createUserSubscription({
        driverUniqueId,
        subscriptionPlanPricingUniqueId,
        startDate,
        endDate,
        userSubscriptionCreatedBy: user?.userUniqueId,
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update by UUID - Dynamic update
exports.updateUserSubscriptionByUniqueId = async (req, res, next) => {
  try {
    const { userSubscriptionUniqueId } = req.params;
    const updateData = req.body;

    const result = await executeInTransaction(async () => {
      return await service.updateUserSubscriptionByUniqueId(
        userSubscriptionUniqueId,
        updateData,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete by UUID
exports.deleteUserSubscriptionByUniqueId = async (req, res, next) => {
  try {
    const { userSubscriptionUniqueId } = req.params;
    const user = req.user;
    const userUniqueId = user?.userUniqueId;

    const result = await executeInTransaction(async () => {
      return await service.deleteUserSubscriptionByUniqueId(
        userSubscriptionUniqueId,
        userUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * Unified GET controller for user subscriptions
 * Handles: /api/userSubscription?driverUniqueId=self&isActive=true
 *          /api/userSubscription?userSubscriptionUniqueId=uuid
 *          /api/userSubscription?driverUniqueId=uuid&isActive=true
 */
exports.getUserSubscriptions = async (req, res, next) => {
  try {
    const user = req?.user;

    // Extract query parameters
    const {
      page = 1,
      limit = 10,
      userSubscriptionUniqueId,
      subscriptionPlanUniqueId,
      isActive,
      isFree,
      startDateBefore,
      startDateAfter,
      endDateBefore,
      endDateAfter,
      planName,
      planDescription,
      sortBy = "userSubscriptionId",
      sortOrder = "DESC",
    } = req.query;

    // Handle 'self' pattern for driverUniqueId or userUniqueId
    let driverUniqueId = req.query.driverUniqueId || req.query.userUniqueId;
    if (driverUniqueId === "self") {
      driverUniqueId = user?.userUniqueId;
    }

    // Build filter object
    const filters = {
      page: parseInt(page),
      limit: parseInt(limit),
      userSubscriptionUniqueId,
      driverUniqueId,
      subscriptionPlanUniqueId,
      isActive:
        isActive !== undefined
          ? isActive === "true" || isActive === true
          : undefined,
      isFree:
        isFree !== undefined ? isFree === "true" || isFree === true : undefined,
      startDateBefore,
      startDateAfter,
      endDateBefore,
      endDateAfter,
      planName,
      planDescription,
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
    };

    // Get filtered subscriptions using unified service
    const result = await service.getUserSubscriptionsWithFilters(filters);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
