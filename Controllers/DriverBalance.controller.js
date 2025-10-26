const ServerResponder = require("../Utils/ServerResponder");
const {
  getAllDriverBalances,
  getDriverBalanceById,
  getDriverLastBalanceByUserUniqueId,
  getDriverBalanceByDateRange,
  getDriverBalanceByFilterServices,
} = require("../Services/DriverBalance.service/DriverBalance.get.service");
const {
  updateDriverBalance,
} = require("../Services/DriverBalance.service/DriverBalance.update.service");
const {
  deleteDriverBalance,
} = require("../Services/DriverBalance.service/DriverBalance.delete.service");
const prepareAndCreateNewBalance = require("../Services/DriverBalance.service/DriverBalance.post.service");
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
    console.log("@createDriverBalance error", error);
    res
      .status(500)
      .json({ message: "Failed to create driver balance record", error });
  }
};

// Get all driver balance records
exports.getAllDriverBalances = async (req, res) => {
  try {
    const result = await getAllDriverBalances();
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
    const result = await getDriverBalanceById(req.params.driverBalanceUniqueId);
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
    const result = await updateDriverBalance(
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
    const result = await deleteDriverBalance(req.params.driverBalanceUniqueId);
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
      toDate = params?.toDate,
      offset = params?.length;
    console.log("@offsetLength", offset);
    const user = req.user;
    console.log("@userUniqueId", userUniqueId);
    if (userUniqueId == "self") {
      userUniqueId = user?.userUniqueId;
    } else {
    }
    let result = "";
    if (!fromDate && !toDate)
      result = await getDriverLastBalanceByUserUniqueId(userUniqueId);
    else if (fromDate && toDate)
      result = await getDriverBalanceByDateRange({
        fromDate,
        toDate,
        userUniqueId,
        offset,
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
    const result = await getDriverLastBalanceByUserUniqueId(driverUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error getting last balance:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to get current balance",
    });
  }
};
exports.getDriverBalanceByFilter = async (req, res) => {
  const result = await getDriverBalanceByFilterServices(req?.query);
  ServerResponder(res, result);
};
