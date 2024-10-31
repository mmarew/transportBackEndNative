const tarrifRateService = require("../Services/TarrifRate.service");

// Create a new tariff rate
exports.createTarrifRate = async (req, res) => {
  try {
    const result = await tarrifRateService.createTarrifRate(req.body);
    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to create tariff rate", error });
  }
};

// Get all tariff rates
exports.getAllTarrifRates = async (req, res) => {
  try {
    const result = await tarrifRateService.getAllTarrifRates();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve tariff rates", error });
  }
};

// Get a tariff rate by ID
exports.getTarrifRateById = async (req, res) => {
  try {
    const result = await tarrifRateService.getTarrifRateById(req.params.id);
    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ message: "Tariff rate not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to retrieve tariff rate", error });
  }
};

// Update a tariff rate by ID
exports.updateTarrifRate = async (req, res) => {
  try {
    const result = await tarrifRateService.updateTarrifRate(
      req.params.id,
      req.body
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to update tariff rate", error });
  }
};

// Delete a tariff rate by ID
exports.deleteTarrifRate = async (req, res) => {
  try {
    const result = await tarrifRateService.deleteTarrifRate(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ message: "Failed to delete tariff rate", error });
  }
};
