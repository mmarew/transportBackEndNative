const commissionService = require("../Services/Commission.service");

// Create a new commission record
exports.createCommission = async (req, res) => {
  try {
    const result = await commissionService.createCommission(req.body);
    res.status(201).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to create commission record", error });
  }
};

// Get all commission records
exports.getAllCommissions = async (req, res) => {
  try {
    const result = await commissionService.getAllCommissions();
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve commission records", error });
  }
};

// Get a commission record by ID
exports.getCommissionById = async (req, res) => {
  try {
    const result = await commissionService.getCommissionById(req.params.id);
    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ message: "Commission record not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve commission record", error });
  }
};

// Update a commission record by ID
exports.updateCommission = async (req, res) => {
  try {
    const result = await commissionService.updateCommission(
      req.params.id,
      req.body
    );
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update commission record", error });
  }
};

// Delete a commission record by ID
exports.deleteCommission = async (req, res) => {
  try {
    const result = await commissionService.deleteCommission(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete commission record", error });
  }
};
