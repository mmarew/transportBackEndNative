const tarrifRateService = require("../Services/TarrifRate.service");

// Create a new tariff rate
exports.createTarrifRate = async (req, res) => {
  try {
    const user = req.user;
    req.body.user = user;
    const result = await tarrifRateService.createTarrifRate(req.body);
    res.status(201).json(result);
  } catch (error) {
    console.log("@createTarrifRate error", error);
    res
      .status(500)
      .json({ message: "error", error: "Failed to create tariff rate" });
  }
};

// Get all tariff rates
exports.getAllTarrifRates = async (req, res) => {
  try {
    const result = await tarrifRateService.getAllTarrifRates();
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "error", error: "Failed to retrieve tariff rates" });
  }
};

// Get a tariff rate by ID
exports.getTarrifRateById = async (req, res) => {
  try {
    const result = await tarrifRateService.getTarrifRateById(req.params.id);
    if (result) {
      res.status(200).json(result);
    } else {
      res
        .status(404)
        .json({ message: "error", error: "Tariff rate not found" });
    }
  } catch (error) {
    res.status(500).json({
      message: "error",
      error: "Failed to retrieve tariff rate",
    });
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
    res
      .status(500)
      .json({ message: "error", error: "Failed to update tariff rate" });
  }
};

// Delete a tariff rate by ID
exports.deleteTarrifRate = async (req, res) => {
  try {
    const result = await tarrifRateService.deleteTarrifRate(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "error", error: "Failed to delete tariff rate" });
  }
};
