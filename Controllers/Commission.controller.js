const commissionService = require("../Services/Commission.service");

// Create a new commission record
exports.createCommission = async (req, res) => {
  try {
    const result = await commissionService.createCommission(req.body);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to create commission record",
    });
  }
};

// Get all commission records
exports.getAllCommissions = async (req, res) => {
  try {
    const result = await commissionService.getAllCommissions();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve commission records",
    });
  }
};

// Get a commission record by ID
exports.getCommissionById = async (req, res) => {
  try {
    const result = await commissionService.getCommissionById(req.params.id);
    if (result) {
      ServerResponder(res, result);
    } else {
      ServerResponder(res, {
        message: "error",
        error: "Commission record not found",
      });
    }
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve commission record",
    });
  }
};

// Update a commission record by ID
exports.updateCommission = async (req, res) => {
  try {
    const result = await commissionService.updateCommission(
      req.params.id,
      req.body
    );
    rServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "Failed to update commission record",
      error,
    });
  }
};

// Delete a commission record by ID
exports.deleteCommission = async (req, res) => {
  try {
    const result = await commissionService.deleteCommission(req.params.id);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "Failed to delete commission record",
      error,
    });
  }
};
