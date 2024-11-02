// commissionRateController.js

const commissionRateService = require("../Services/CommissionRates.service");
const { v4: uuidv4 } = require("uuid");
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
    res.status(201).json({
      message: "Commission rate created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error creating commission rate:", error);
    res.status(500).json({ message: "Error creating commission rate", error });
  }
};

// Retrieve all commission rates
exports.getAllCommissionRates = async (req, res) => {
  try {
    const commissionRates = await commissionRateService.getAllCommissionRates();
    res.status(200).json({ data: commissionRates });
  } catch (error) {
    console.error("Error fetching commission rates:", error);
    res.status(500).json({ message: "Error fetching commission rates", error });
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

    if (!commissionRate) {
      return res.status(404).json({ message: "Commission rate not found" });
    }

    res.status(200).json({ data: commissionRate });
  } catch (error) {
    console.error("Error fetching commission rate:", error);
    res.status(500).json({ message: "Error fetching commission rate", error });
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

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Commission rate not found or no changes made" });
    }

    res.status(200).json({ message: "Commission rate updated successfully" });
  } catch (error) {
    console.error("Error updating commission rate:", error);
    res.status(500).json({ message: "Error updating commission rate", error });
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

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "Commission rate not found or already deleted" });
    }

    res.status(200).json({ message: "Commission rate deleted successfully" });
  } catch (error) {
    console.error("Error deleting commission rate:", error);
    res.status(500).json({ message: "Error deleting commission rate", error });
  }
};
