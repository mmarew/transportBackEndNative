const service = require("../Services/DriverSubscription.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create
exports.createDriverSubscription = async (req, res) => {
  try {
    const { subscriptionPlanUniqueId, startDate, endDate } = req.body;
    const user = req.user;
    console.log("@user", user);
    let driverUniqueId = req?.params?.driverUniqueId;
    if (driverUniqueId == "self") driverUniqueId = user?.userUniqueId;
    console.log("@driverUniqueId", driverUniqueId);

    const result = await service.createDriverSubscription(
      driverUniqueId,
      subscriptionPlanUniqueId,
      startDate,
      endDate
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error creating driver subscription:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create driver subscription",
    });
  }
};

// Get all
// exports.getAllDriverSubscriptions = async (req, res) => {
//   try {
//     const result = await service.getAllDriverSubscriptions();
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching driver subscriptions:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch subscriptions",
//     });
//   }
// };

// Update by UUID
exports.updateDriverSubscriptionByUniqueId = async (req, res) => {
  try {
    const { driverSubscriptionUniqueId } = req.params;
    const { startDate, endDate, subscriptionPlanUniqueId } = req.body;
    const result = await service.updateDriverSubscriptionByUniqueId(
      driverSubscriptionUniqueId,
      startDate,
      endDate,
      subscriptionPlanUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating subscription:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update subscription ",
    });
  }
};

// Delete by UUID
exports.deleteDriverSubscriptionByUniqueId = async (req, res) => {
  try {
    const { driverSubscriptionUniqueId } = req.params;
    const result = await service.deleteDriverSubscriptionByUniqueId(
      driverSubscriptionUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error deleting subscription:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete subscription",
    });
  }
};

// const service = require("../Services/DriverSubscription.service");
// const ServerResponder = require("../Utils/ServerResponder");

// Consolidated GET method with filtering
exports.getDriverSubscriptionsWithFilters = async (req, res) => {
  try {
    // Extract all possible query parameters
    const {
      page = 1,
      limit = 10,

      // ID filters
      driverSubscriptionUniqueId,
      driverUniqueId,
      subscriptionPlanUniqueId,

      // Status filters
      isActive,
      isFree,

      // Date filters
      startDateBefore,
      startDateAfter,
      endDateBefore,
      endDateAfter,
      createdAtStart,
      createdAtEnd,

      // Plan filters
      planName,
      planDescription,

      // Pricing filters
      minPrice,
      maxPrice,
      durationInDays,

      // User-related filters
      createdBy,

      // Special filters
      daily,
      monthly,
      upcomingExpiry, // within 7 days
      expired, // endDate < now()

      // Sorting
      sortBy = "driverSubscriptionId",
      sortOrder = "DESC",

      // Aggregation
      countOnly = false,

      // Role-based filters
      roleFilter, // For admin vs driver access
    } = req.query;

    // Build filter object
    const filters = {
      page: parseInt(page),
      limit: parseInt(limit),

      // ID filters
      driverSubscriptionUniqueId,
      driverUniqueId,
      subscriptionPlanUniqueId,

      // Status filters
      isActive: isActive ? isActive === "true" : undefined,
      isFree: isFree ? isFree === "true" : undefined,

      // Date filters
      startDateBefore,
      startDateAfter,
      endDateBefore,
      endDateAfter,
      createdAtStart,
      createdAtEnd,

      // Plan filters
      planName,
      planDescription,

      // Pricing filters
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      durationInDays: durationInDays ? parseInt(durationInDays) : undefined,

      // User filters
      createdBy,

      // Special filters
      daily: daily ? daily === "true" : undefined,
      monthly: monthly ? monthly === "true" : undefined,
      upcomingExpiry: upcomingExpiry ? upcomingExpiry === "true" : undefined,
      expired: expired ? expired === "true" : undefined,

      // Sorting
      sortBy,
      sortOrder: sortOrder.toUpperCase(),

      // Aggregation
      countOnly: countOnly ? countOnly === "true" : false,

      // Role-based (from token)
      roleFilter: req.user?.role,
    };

    // If driverSubscriptionUniqueId is provided, get single record
    if (driverSubscriptionUniqueId) {
      const result = await service.getDriverSubscriptionByUniqueId(
        driverSubscriptionUniqueId
      );
      return ServerResponder(res, result);
    }

    // If countOnly is true, return count only
    if (filters.countOnly) {
      const result = await service.getDriverSubscriptionsCount(filters);
      return ServerResponder(res, result);
    }

    // Default: get filtered subscriptions
    const result = await service.getDriverSubscriptionsWithFilters(filters);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching driver subscriptions:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscriptions",
      details: error.message,
    });
  }
};

// Other controller methods remain the same...
exports.createDriverSubscription = async (req, res) => {
  try {
    const { subscriptionPlanUniqueId, startDate, endDate } = req.body;
    const user = req.user;
    let driverUniqueId = req?.params?.driverUniqueId;
    if (driverUniqueId == "self") driverUniqueId = user?.userUniqueId;

    const result = await service.createDriverSubscription(
      driverUniqueId,
      subscriptionPlanUniqueId,
      startDate,
      endDate
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error creating driver subscription:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create driver subscription",
    });
  }
};

// ... keep other existing controller methods
