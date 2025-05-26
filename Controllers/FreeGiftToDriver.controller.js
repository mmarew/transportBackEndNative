const service = require("../Services/FreeGiftToDriver.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createFreeGiftToDriver = async (req, res) => {
  try {
    let driverUniqueId = req.params.driverUniqueId;
    const { subscriptionPlanUniqueId, giftAmount, giftTime } = req.body;

    if (driverUniqueId === "self") {
      driverUniqueId = req.user.userUniqueId;
    }

    const result = await service.createFreeGiftToDriver({
      driverUniqueId,
      subscriptionPlanUniqueId,
      giftAmount,
      giftTime,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.error("Error creating free gift:", error);
    ServerResponder(res, { message: "error", error: "Failed to create gift" });
  }
};

exports.getAllFreeGiftToDrivers = async (req, res) => {
  try {
    const result = await service.getAllFreeGiftToDrivers();
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching free gifts:", error);
    ServerResponder(res, { message: "error", error: "Failed to fetch data" });
  }
};

exports.getFreeGiftToDriverByUniqueId = async (req, res) => {
  try {
    const { freeGiftUniqueId } = req.params;
    const result = await service.getFreeGiftToDriverByUniqueId(
      freeGiftUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching gift by ID:", error);
    ServerResponder(res, { message: "error", error: "Gift not found" });
  }
};

exports.getFreeGiftToDriverByDriverId = async (req, res) => {
  try {
    let driverUniqueId = req.params.driverUniqueId;
    if (driverUniqueId === "self") {
      driverUniqueId = req.user.userUniqueId;
    }
    const result = await service.getFreeGiftToDriverByDriverId(driverUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error fetching gift by driver ID:", error);
    ServerResponder(res, { message: "error", error: "Driver data not found" });
  }
};

exports.deleteFreeGiftToDriverByUniqueId = async (req, res) => {
  try {
    const { freeGiftUniqueId } = req.params;
    const result = await service.deleteFreeGiftToDriverByUniqueId(
      freeGiftUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error deleting gift:", error);
    ServerResponder(res, { message: "error", error: "Failed to delete gift" });
  }
};
