const driverBalanceService = require("../Services/DriverBalance.service");
const ServerResponder = require("../Utils/ServerResponder");
const prepareAndCreateNewBalance = require("../Utils/PrepareNewBalance");
// Create a new driver balance record
exports.createDriverBalance = async (req, res) => {
  try {
    const user = req?.user;
    const result = await prepareAndCreateNewBalance.createDriverBalance({
      ...req.body,
      ...user,
    });
    ServerResponder(res, result);
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
    ServerResponder(res, result);
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
      req.params.driverBalanceUniqueId
    );
    if (result) {
      ServerResponder(res, result);
    } else {
      ServerResponder(res, {
        message: "error",
        error: "Driver balance record not found",
      });
    }
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve driver balance record",
    });
  }
};

// Update a driver balance record by ID
exports.updateDriverBalance = async (req, res) => {
  try {
    const result = await driverBalanceService.updateDriverBalance(
      req.params.driverBalanceUniqueId,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to update driver balance record",
    });
  }
};

// Delete a driver balance record by ID
exports.deleteDriverBalance = async (req, res) => {
  try {
    const result = await driverBalanceService.deleteDriverBalance(
      req.params.driverBalanceUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete driver balance record",
    });
  }
};
exports.getDriverLastBalanceByUserUniqueId = async (req, res) => {
  try {
    const params = req?.params;
    let userUniqueId = params?.driverUniqueId;
    const fromDate = params?.fromDate,
      toDate = params?.toDate;

    const user = req.user;
    console.log("@userUniqueId", userUniqueId);
    if (userUniqueId == "self") {
      userUniqueId = user?.userUniqueId;
    } else {
    }
    let result = "";
    if (!fromDate && !toDate)
      result = await driverBalanceService.getDriverLastBalanceByUserUniqueId(
        userUniqueId
      );
    else if (fromDate && toDate)
      result = await driverBalanceService.getDriverBalanceByDateRange({
        fromDate,
        toDate,
      });
    return ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to retrieve driver balance record",
    });
  }
};
exports.getDriverCurrentBalance = async (req, res) => {
  try {
    const { driverUniqueId } = req.params;
    const result =
      await driverBalanceService.getDriverLastBalanceByUserUniqueId(
        driverUniqueId
      );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error getting last balance:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to get current balance",
    });
  }
};
