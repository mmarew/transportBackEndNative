const driverBalanceService = require("../Services/DriverBalance.service");

// Create a new driver balance record
exports.createDriverBalance = async (req, res) => {
  try {
    const result = await driverBalanceService.createDriverBalance(req.body);
    res.status(201).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to create driver balance record", error });
  }
};

// Get all driver balance records
exports.getAllDriverBalances = async (req, res) => {
  try {
    const result = await driverBalanceService.getAllDriverBalances();
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve driver balance records", error });
  }
};

// Get a driver balance record by ID
exports.getDriverBalanceById = async (req, res) => {
  try {
    const result = await driverBalanceService.getDriverBalanceById(
      req.params.id
    );
    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ message: "Driver balance record not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve driver balance record", error });
  }
};

// Update a driver balance record by ID
exports.updateDriverBalance = async (req, res) => {
  try {
    const result = await driverBalanceService.updateDriverBalance(
      req.params.id,
      req.body
    );
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update driver balance record", error });
  }
};

// Delete a driver balance record by ID
exports.deleteDriverBalance = async (req, res) => {
  try {
    const result = await driverBalanceService.deleteDriverBalance(
      req.params.id
    );
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete driver balance record", error });
  }
};
