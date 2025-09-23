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
    const { status, driverUserUniqueId } = req.params;
    const result = await service.getOneDriverDepositDataByStatus({
      status,
      driverUserUniqueId,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch By Status Error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposits by status",
    });
  }
};

exports.getDriverDeposit = async (req, res) => {
  try {
    const {
      driverUniqueId,
      depositStatus,
      page = 1,
      limit = 10,
      sortBy = "depositTime",
      sortOrder = "DESC",
    } = req.query;

    const result = await service.getDriverDeposit({
      driverUniqueId,
      depositStatus,
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
    });

    ServerResponder(res, result);
  } catch (error) {
    console.log("@getAllDriverDepositData error", error);
    ServerResponder(res, { error: error.message }, 500);
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
exports.getDriverDepositByUniqueIdAndDriverUniqueId = async (req, res) => {
  try {
    const { driverDepositUniqueId } = req.params;
    let driverUniqueId = req?.params?.driverUniqueId;
    if (driverUniqueId == "self") {
      driverUniqueId = req.user?.userUniqueId;
    }

    const result = await service.getDriverDepositByUniqueIdAndDriverUniqueId({
      driverDepositUniqueId,
      driverUniqueId,
    });
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
exports.getDepositsByDateRangeAndDriver = async (req, res) => {
  try {
    const { driverUniqueId, startDate, endDate } = req.query;
    const user = req?.user;
    console.log("@user", user);
    if (!driverUniqueId || !startDate || !endDate) {
      return ServerResponder(res, {
        message: "error",
        error: "Missing driverUniqueId, startDate, or endDate",
      });
    }

    const result = await service.getDepositsByDateRangeAndDriver({
      driverUniqueId:
        driverUniqueId == "self" ? user?.userUniqueId : driverUniqueId,
      startDate,
      endDate,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.error("Fetch by date range error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch deposits by date range",
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
exports.getUnauthorizedDeposits = async (req, res) => {
  try {
    const result = await service.getUnauthorizedDeposits();
    ServerResponder(res, result);
  } catch (error) {
    console.error("@getUnauthorizedDeposits", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch unauthorized deposits",
    });
  }
};
