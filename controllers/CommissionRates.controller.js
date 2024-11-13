// commissionRateController.js

const commissionRateService = require("../Services/CommissionRates.service");
const { v4: uuidv4 } = require("uuid");
const ServerResponder = require("../Utils/ServerResponder");
// Create a new commission rate
exports.createCommissionRate = async (req, res) => {
  const commissionRateUniqueId = uuidv4();
  const { commissionRate, commissionRateEffectiveDate } = req.body;
  const user = req.user;
  const userUniqueId = user.userUniqueId;
  try {
    const result = await commissionRateService.createCommissionRate({
      commissionRateUniqueId,
      commissionRate,
      commissionRateEffectiveDate,
      commissionRateCreatedBy: userUniqueId,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating commission rate:", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};

// Retrieve all commission rates
exports.getAllCommissionRates = async (req, res) => {
  try {
    const commissionRates = await commissionRateService.getAllCommissionRates();
    ServerResponder(res, commissionRates);
  } catch (error) {
    console.log("Error fetching commission rates:", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};

// Retrieve a commission rate by its unique ID
exports.getCommissionRateByUniqueId = async (req, res) => {
  const { commissionRateUniqueId } = req.params;

  try {
    const commissionRate =
      await commissionRateService.getCommissionRateByUniqueId(
        commissionRateUniqueId
      );

    ServerResponder(res, commissionRate);
  } catch (error) {
    console.log("Error fetching commission rate:", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};

// Update a commission rate by its unique ID
exports.updateCommissionRateByUniqueId = async (req, res) => {
  const { commissionRateUniqueId } = req.params;
  const {
    commissionRate,
    commissionRateEffectiveDate,
    commissionRateExpirationDate,
    commissionRateUpdatedBy,
  } = req.body;

  try {
    const result = await commissionRateService.updateCommissionRateByUniqueId({
      commissionRateUniqueId,
      commissionRate,
      commissionRateEffectiveDate,
      commissionRateExpirationDate,
      commissionRateUpdatedBy,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating commission rate:", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};

// Soft delete a commission rate by its unique ID
exports.deleteCommissionRateByUniqueId = async (req, res) => {
  const { commissionRateUniqueId } = req.params;
  const { commissionRateDeletedBy } = req.body;

  try {
    const result = await commissionRateService.deleteCommissionRateByUniqueId({
      commissionRateUniqueId,
      commissionRateDeletedBy,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting commission rate:", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
