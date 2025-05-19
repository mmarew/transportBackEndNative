const service = require("../Services/DriverSubscription.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create
exports.createDriverSubscription = async (req, res) => {
  try {
    const { driverUniqueId, subscriptionPlanUniqueId, startDate, endDate } =
      req.body;
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
exports.getAllDriverSubscriptions = async (req, res) => {
  try {
    const result = await service.getAllDriverSubscriptions();
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching driver subscriptions:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscriptions",
    });
  }
};
exports.getDriverSubscriptionsByDriverId = async (req, res) => {
  try {
    const { driverUniqueId } = req.params;
    const result = await service.getDriverSubscriptionsByDriverId(
      driverUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscriptions by driver:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscriptions by driver",
    });
  }
};

exports.getDriverSubscriptionsByPlanId = async (req, res) => {
  try {
    const { subscriptionPlanId } = req.params;
    const result = await service.getDriverSubscriptionsByPlanId(
      subscriptionPlanId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscriptions by plan:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscriptions by plan",
    });
  }
};

// Get by UUID
exports.getDriverSubscriptionByUniqueId = async (req, res) => {
  try {
    const { driverSubscriptionUniqueId } = req.params;
    const result = await service.getDriverSubscriptionByUniqueId(
      driverSubscriptionUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscription:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscription",
    });
  }
};

// Update by UUID
exports.updateDriverSubscriptionByUniqueId = async (req, res) => {
  try {
    const { driverSubscriptionUniqueId } = req.params;
    const { startDate, endDate, subscriptionPlanId } = req.body;
    const result = await service.updateDriverSubscriptionByUniqueId(
      driverSubscriptionUniqueId,
      startDate,
      endDate,
      subscriptionPlanId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error updating subscription:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update subscription",
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
