const service = require("../Services/DriverDeposit.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createDriverDeposit = async (req, res) => {
  try {
    const {
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      depositTime,
    } = req.body;
    const result = await service.createDriverDeposit(
      driverUniqueId,
      depositAmount,
      depositSourceUniqueId,
      depositTime
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Create Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create deposit",
    });
  }
};

exports.getAllDriverDeposits = async (req, res) => {
  try {
    const result = await service.getAllDriverDeposits();
    ServerResponder(res, result);
  } catch (error) {
    console.error("Get All Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposits",
    });
  }
};

exports.getDriverDepositByUniqueId = async (req, res) => {
  try {
    const { driverDepositUniqueId } = req.params;
    const result = await service.getDriverDepositByUniqueId(
      driverDepositUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Get By UUID Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposit",
    });
  }
};

exports.getDriverDepositsByDriverId = async (req, res) => {
  try {
    const { driverUniqueId } = req.params;
    const result = await service.getDriverDepositsByDriverId(driverUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    console.error("Get By Driver ID Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch driver deposits",
    });
  }
};

exports.updateDriverDepositByUniqueId = async (req, res) => {
  try {
    const { driverDepositUniqueId } = req.params;
    const { depositAmount, depositSourceUniqueId, depositTime } = req.body;
    const result = await service.updateDriverDepositByUniqueId(
      driverDepositUniqueId,
      depositAmount,
      depositSourceUniqueId,
      depositTime
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
