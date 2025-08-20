const tariffRateService = require("../Services/TariffRate.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new tariff rate
exports.createTariffRate = async (req, res) => {
  try {
    const user = req.user;
    req.body.user = user;
    const result = await tariffRateService.createTariffRate(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("@createTariffRate error", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create tariff rate",
    });
  }
};

// Get all tariff rates
exports.getAllTariffRates = async (req, res) => {
  try {
    const result = await tariffRateService.getAllTariffRates();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve tariff rates",
    });
  }
};

// Get a tariff rate by ID
exports.getTariffRateById = async (req, res) => {
  try {
    const result = await tariffRateService.getTariffRateById(
      req.params.tariffRateUniqueId
    );
    if (result) {
      ServerResponder(res, result);
    } else {
      ServerResponder(res, {
        message: "error",
        error: "Tariff rate not found",
      });
    }
  } catch (error) {
    res.status(500).json({
      message: "error",
      error: "Failed to retrieve tariff rate",
    });
  }
};

// Update a tariff rate by ID
exports.updateTariffRate = async (req, res) => {
  try {
    const result = await tariffRateService.updateTariffRate(
      req.params.tariffRateUniqueId,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("@updateTariffRate", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update tariff rate",
    });
  }
};

// Delete a tariff rate by ID
exports.deleteTariffRate = async (req, res) => {
  try {
    const result = await tariffRateService.deleteTariffRate(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete tariff rate",
    });
  }
};
