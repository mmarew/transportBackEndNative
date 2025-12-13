// const service = require("../Services/SubscriptionPlanPricing.service");
// const ServerResponder = require("../Utils/ServerResponder");

// // Create
// exports.createPricing = async (req, res) => {
//   try {
//     const {
//       subscriptionPlanUniqueId,
//       price,
//       durationInDays,
//       effectiveFrom,
//       effectiveTo,
//     } = req.body;

//     const result = await service.createPricing(
//       subscriptionPlanUniqueId,
//       price,
//       durationInDays,
//       effectiveFrom,
//       effectiveTo
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error creating pricing:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to create pricing",
//     });
//   }
// };

// exports.getAllPricing = async (req, res) => {
//   try {
//     const result = await service.getAllPricing();
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching all pricings:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch all subscription plan pricings",
//     });
//   }
// };

// // Get by unique pricing ID
// exports.getPricingByUniqueId = async (req, res) => {
//   try {
//     const { subscriptionPlanPricingUniqueId } = req.params;
//     const result = await service.getPricingByUniqueId(
//       subscriptionPlanPricingUniqueId
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching pricing:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch pricing",
//     });
//   }
// };

// // Get all pricings by Plan ID
// exports.getAllPricingByPlanId = async (req, res) => {
//   try {
//     const { subscriptionPlanUniqueId } = req.params;
//     const result = await service.getAllPricingByPlanId(
//       subscriptionPlanUniqueId
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error fetching plan pricings:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to fetch pricings",
//     });
//   }
// };

// // Update by unique pricing ID
// exports.updatePricingByUniqueId = async (req, res) => {
//   try {
//     const { subscriptionPlanPricingUniqueId } = req.params;
//     const { price, durationInDays, effectiveFrom, effectiveTo } = req.body;

//     const result = await service.updatePricingByUniqueId(
//       subscriptionPlanPricingUniqueId,
//       price,
//       durationInDays,
//       effectiveFrom,
//       effectiveTo
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error updating pricing:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to update pricing",
//     });
//   }
// };

// // Delete by unique pricing ID
// exports.deletePricingByUniqueId = async (req, res) => {
//   try {
//     const { subscriptionPlanPricingUniqueId } = req.params;
//     const result = await service.deletePricingByUniqueId(
//       subscriptionPlanPricingUniqueId
//     );
//     ServerResponder(res, result);
//   } catch (error) {
//     console.error("Error deleting pricing:", error);
//     ServerResponder(res, {
//       message: "error",
//       error: "Failed to delete pricing",
//     });
//   }
// };
const service = require("../Services/SubscriptionPlanPricing.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create
exports.createPricing = async (req, res) => {
  try {
    const {
      subscriptionPlanUniqueId,
      price,
      durationInDays,
      effectiveFrom,
      effectiveTo,
    } = req.body;

    const result = await service.createPricing(
      subscriptionPlanUniqueId,
      price,
      durationInDays,
      effectiveFrom,
      effectiveTo
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error creating pricing:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create pricing",
    });
  }
};

// Single GET endpoint with comprehensive filtering
exports.getPricingWithFilters = async (req, res) => {
  try {
    // Extract all possible filter parameters from query string
    const {
      subscriptionPlanPricingUniqueId,
      subscriptionPlanUniqueId,
      date, // For active pricing checks
      isActive, // true/false to get active/inactive pricing
      sortBy = " SubscriptionPlanPricing.createdAt ",
      sortOrder = "DESC",
      page = 1,
      limit = 10,
    } = req.query;

    // Build filter object
    const filters = {
      subscriptionPlanPricingUniqueId,
      subscriptionPlanUniqueId,
      date: date || new Date().toISOString().split("T")[0], // Default to today
      isActive: isActive ? isActive === "true" : undefined,
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
      page: parseInt(page),
      limit: parseInt(limit),
    };

    // Remove undefined filters
    Object.keys(filters).forEach((key) => {
      if (filters[key] === undefined || filters[key] === "") {
        delete filters[key];
      }
    });

    const result = await service.getPricingWithFilters(filters);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching pricing with filters:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch pricing data",
    });
  }
};

// Update by unique pricing ID
exports.updatePricingByUniqueId = async (req, res) => {
  try {
    const { subscriptionPlanPricingUniqueId } = req.params;
    const { price, durationInDays, effectiveFrom, effectiveTo } = req.body;

    const result = await service.updatePricingByUniqueId(
      subscriptionPlanPricingUniqueId,
      price,
      durationInDays,
      effectiveFrom,
      effectiveTo
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error updating pricing:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update pricing",
    });
  }
};

// Delete by unique pricing ID
exports.deletePricingByUniqueId = async (req, res) => {
  try {
    const { subscriptionPlanPricingUniqueId } = req.params;
    const result = await service.deletePricingByUniqueId(
      subscriptionPlanPricingUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error deleting pricing:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete pricing",
    });
  }
};
