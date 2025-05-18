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

exports.getAllPricings = async (req, res) => {
  try {
    const result = await service.getAllPricings();
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching all pricings:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch all subscription plan pricings",
    });
  }
};

// Get by unique pricing ID
exports.getPricingByUniqueId = async (req, res) => {
  try {
    const { subscriptionPlanPricingUniqueId } = req.params;
    const result = await service.getPricingByUniqueId(
      subscriptionPlanPricingUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching pricing:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch pricing",
    });
  }
};

// Get all pricings by Plan ID
exports.getAllPricingsByPlanId = async (req, res) => {
  try {
    const { subscriptionPlanUniqueId } = req.params;
    const result = await service.getAllPricingsByPlanId(
      subscriptionPlanUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching plan pricings:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch pricings",
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
