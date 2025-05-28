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
exports.getAllOrActiveDriverSubscriptionsByDriverUUId = async (req, res) => {
  try {
    let driverUniqueId = req.params?.driverUniqueId;
    const user = req?.user;
    if (driverUniqueId == "self") {
      driverUniqueId = user?.userUniqueId;
    }
    const { isActive } = req.params;
    const result = await service.getAllOrActiveDriverSubscriptionsByDriverUUId({
      driverUniqueId,
      isActive,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscriptions by driver:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscriptions by driver",
    });
  }
};

exports.getDriverSubscriptionsByPlanUniqueId = async (req, res) => {
  try {
    const { subscriptionPlanUniqueId } = req.params;
    const result = await service.getDriverSubscriptionsByPlanUniqueId(
      subscriptionPlanUniqueId
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
exports.getSubscriptionBydriverUniqueIdAndPlanUniqueId = async (req, res) => {
  try {
    const { driverUniqueId, subscriptionPlanUniqueId } = req.params;
    const result = await service.getSubscriptionBydriverUniqueIdAndPlanUniqueId(
      { driverUniqueId, subscriptionPlanUniqueId }
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching subscription by driver and plan:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch subscription by driver and plan",
    });
  }
};
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
