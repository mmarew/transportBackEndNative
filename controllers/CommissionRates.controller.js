const commissionRatesService = require("../Services/CommissionRates.service");

// Create a new commission rate
exports.createCommissionRate = async (req, res) => {
  try {
    const result = await commissionRatesService.createCommissionRate(req.body);
    res.status(201).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to create commission rate", error });
  }
};

// Get all commission rates
exports.getAllCommissionRates = async (req, res) => {
  try {
    const result = await commissionRatesService.getAllCommissionRates();
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve commission rates", error });
  }
};

// Get a commission rate by ID
exports.getCommissionRateById = async (req, res) => {
  try {
    const result = await commissionRatesService.getCommissionRateById(
      req.params.id
    );
    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ message: "Commission rate not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve commission rate", error });
  }
};

// Update a commission rate by ID
exports.updateCommissionRate = async (req, res) => {
  try {
    const result = await commissionRatesService.updateCommissionRate(
      req.params.id,
      req.body
    );
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update commission rate", error });
  }
};

// Delete a commission rate by ID
exports.deleteCommissionRate = async (req, res) => {
  try {
    const result = await commissionRatesService.deleteCommissionRate(
      req.params.id
    );
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete commission rate", error });
  }
};
