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

exports.getDriverDeposit = async (req, res) => {
  try {
    const query = req.query;
    const user = req?.user;
    console.log("@getDriverDeposit user", user);
    let driverUniqueId = req?.query?.driverUniqueId;
    if (driverUniqueId == "self" || !driverUniqueId) {
      driverUniqueId = req?.user?.userUniqueId;
    }
    const filter = {
      ...query,
      driverUniqueId,
      page: parseInt(query?.page) || 1,
      limit: parseInt(query?.limit) || 10,
      sortBy: query?.sortBy || "depositTime",
      sortOrder: query?.sortOrder || "DESC",
    };

    const result = await service.getDriverDeposit({
      ...filter,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.log("@getAllDriverDepositData error", error);
    ServerResponder(res, { error: error.message }, 500);
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
/**
 * @function updateDriverDepositStatus
 * @route PATCH /api/driverDeposit/status
 * @description Controller to update driver deposit status.
 */
exports.updateDriverDepositStatus = async (req, res) => {
  try {
    const { driverDepositUniqueId, depositStatus } = req.body;

    if (!driverDepositUniqueId || !depositStatus) {
      return ServerResponder(res, {
        message: "error",
        error: "Missing driverDepositUniqueId or depositStatus",
      });
    }

    const result = await service?.updateDriverDepositStatusService({
      driverDepositUniqueId,
      newStatus: depositStatus,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.error("Update deposit status error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update deposit status",
    });
  }
};
