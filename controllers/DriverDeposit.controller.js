const driverDepositService = require("../Services/DriverDeposit.service");

// Create a new driver deposit record
exports.createDriverDeposit = async (req, res) => {
  try {
    const result = await driverDepositService.createDriverDeposit(req.body);
    res.status(201).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to create driver deposit record", error });
  }
};

// Get all driver deposit records
exports.getAllDriverDeposits = async (req, res) => {
  try {
    const result = await driverDepositService.getAllDriverDeposits();
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve driver deposit records", error });
  }
};

// Get a driver deposit record by ID
exports.getDriverDepositById = async (req, res) => {
  try {
    const result = await driverDepositService.getDriverDepositById(
      req.params.id
    );
    if (result) {
      res.status(200).json(result);
    } else {
      res.status(404).json({ message: "Driver deposit record not found" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to retrieve driver deposit record", error });
  }
};

// Update a driver deposit record by ID
exports.updateDriverDeposit = async (req, res) => {
  try {
    const result = await driverDepositService.updateDriverDeposit(
      req.params.id,
      req.body
    );
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update driver deposit record", error });
  }
};

// Delete a driver deposit record by ID
exports.deleteDriverDeposit = async (req, res) => {
  try {
    const result = await driverDepositService.deleteDriverDeposit(
      req.params.id
    );
    res.status(200).json(result);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete driver deposit record", error });
  }
};
