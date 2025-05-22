const service = require("../Services/DriverDeposit.service");
const currentDate = require("../Utils/CurrentDate");
const ServerResponder = require("../Utils/ServerResponder");

// Create
exports.createDriverDeposit = async (req, res) => {
  try {
    const driverUniqueId = req?.user?.userUniqueId;
    req.body.driverUniqueId = driverUniqueId;
    const depositTime = currentDate();
    req.body.depositTime = depositTime;
    const result = await service.createDriverDeposit(req.body);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Create Deposit Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create deposit",
    });
  }
};
// Get All Deposits By Status
exports.getAllDriverDepositDataByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const result = await service.getAllDriverDepositDataByStatus(status);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch By Status Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposits by status",
    });
  }
};
// Get All Deposits By Status
exports.getOneDriverDepositDataByStatus = async (req, res) => {
  try {
    const { status, driverUserUniqeId } = req.params;
    const result = await service.getOneDriverDepositDataByStatus(status);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch By Status Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposits by status",
    });
  }
};

exports.getAllDriverDepositData = async (req, res) => {
  try {
    const result = await service.getAllDriverDepositData();
    ServerResponder(res, result);
  } catch (error) {
    console.log("@getAllDriverDepositData error", error);
  }
};
// Get All (with optional driverUniqueId filter)
exports.getDriverDepositsWithAccountInfo = async (req, res) => {
  try {
    const { driverUniqueId } = req.query;
    const result = await service.getDriverDepositsWithAccountInfo(
      driverUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch All Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposits",
    });
  }
};

// Get Single
exports.getDriverDepositByUniqueId = async (req, res) => {
  try {
    const { driverDepositUniqueId } = req.params;
    const result = await service.getDriverDepositByUniqueId(
      driverDepositUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch One Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposit",
    });
  }
};

// Update
exports.updateDriverDepositByUniqueId = async (req, res) => {
  try {
    const { driverDepositUniqueId } = req.params;
    const result = await service.updateDriverDepositByUniqueId(
      driverDepositUniqueId,
      req.body
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Update Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update deposit",
    });
  }
};

// Delete
exports.deleteDriverDepositByUniqueId = async (req, res) => {
  try {
    const { driverDepositUniqueId } = req.params;
    const result = await service.deleteDriverDepositByUniqueId(
      driverDepositUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Delete Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete deposit",
    });
  }
};
