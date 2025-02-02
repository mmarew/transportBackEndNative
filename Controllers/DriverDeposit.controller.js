const driverDepositService = require("../Services/DriverDeposit.service");

// Create a new driver deposit record
exports.createDriverDeposit = async (req, res) => {
  try {
    const user = req.user;
    req.body.user = user;
    const result = await driverDepositService.createDriverDeposit(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.log("first error", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create driver deposit record",
    });
  }
};

// Get all driver deposit records
exports.getAllDriverDeposits = async (req, res) => {
  try {
    const result = await driverDepositService.getAllDriverDeposits();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve driver deposit records",
    });
  }
};

// Get a driver deposit record by ID
exports.getDriverDepositById = async (req, res) => {
  try {
    const result = await driverDepositService.getDriverDepositById(
      req.params.driverDepositUniqueId
    );
    if (result) {
      ServerResponder(res, result);
    } else {
      ServerResponder(res, {
        message: "error",
        error: "Driver deposit not found",
      });
    }
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve driver deposit record",
    });
  }
};

// Update a driver deposit record by ID
exports.updateDriverDeposit = async (req, res) => {
  try {
    const result = await driverDepositService.updateDriverDeposit(
      req.params.driverDepositUniqueId,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to update driver deposit record",
    });
  }
};

// Delete a driver deposit record by ID
exports.deleteDriverDeposit = async (req, res) => {
  try {
    const result = await driverDepositService.deleteDriverDeposit(
      req.params.driverDepositUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete driver deposit record",
    });
  }
};
