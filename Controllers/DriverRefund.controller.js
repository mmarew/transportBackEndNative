const service = require("../Services/DriverRefund.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createDriverRefund = async (req, res) => {
  try {
    // driverUserUniqueId is an id of driver who will take refund money
    let driverUserUniqueId = req?.params?.driverUserUniqueId;
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;

    if (driverUserUniqueId == "self") {
      driverUserUniqueId = userUniqueId;
    }
    const refundedBy = userUniqueId;

    const { refundAmount, refundReason, accountUniqueId } = req.body;
    const result = await service.createDriverRefund({
      refundAmount,
      refundReason,
      refundedBy,
      driverUniqueId: driverUserUniqueId,
      accountUniqueId,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.error("Create refund error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create refund",
    });
  }
};
exports.getOneDriverRefundListsByStatus = async (req, res) => {
  try {
    const { driverUserUniqueId, status } = req.params;
    const result = await service.getOneDriverRefundListsByStatus({
      driverUserUniqueId,
      refundStatus: status,
    });
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch single driver refund by status",
    });
  }
};

exports.getAllDriverRefundByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const result = await service.getAllDriverRefundByStatus(status);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch all driver refunds by status",
    });
  }
};

exports.getAllDriverRefunds = async (req, res) => {
  try {
    const result = await service.getAllDriverRefunds();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch refunds",
    });
  }
};

exports.getRefundByUniqueId = async (req, res) => {
  try {
    const { driverRefundUniqueId } = req.params;
    const result = await service.getRefundByUniqueId(driverRefundUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, { message: "error", error: "Refund not found" });
  }
};

exports.getRefundsByDriverId = async (req, res) => {
  try {
    const { driverUniqueId } = req.params;
    const result = await service.getRefundsByDriverId(driverUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch driver refunds",
    });
  }
};

exports.deleteRefundByUniqueId = async (req, res) => {
  try {
    const { driverRefundUniqueId } = req.params;
    const result = await service.deleteRefundByUniqueId(driverRefundUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete refund",
    });
  }
};
exports.acceptDriverRefundRequest = async (req, res) => {
  try {
    const { driverRefundUniqueId } = req.params;
    const { refundStatus, refundUrl } = req.body;

    if (!refundStatus || !refundUrl) {
      return ServerResponder(res, {
        message: "error",
        error: "Both 'refundStatus' and 'refundUrl' are required",
      });
    }

    const result = await service.acceptDriverRefundRequest({
      driverRefundUniqueId,
      refundStatus,
      refundUrl,
    });

    ServerResponder(res, result);
  } catch (error) {
    console.error("Update refund error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update refund",
    });
  }
};

exports.getRefundsByDateRange = async (req, res) => {
  try {
    const { driverUniqueId, startDate, endDate } = req.query;
    const result = await service.getRefundsByDateRange({
      driverUniqueId,
      startDate,
      endDate,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in getRefundsByDateRange:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch refunds by date range",
    });
  }
};

exports.getRefundsByStatusAndDateRange = async (req, res) => {
  try {
    const { status, startDate, endDate, driverUniqueId } = req.query;
    const result = await service.getRefundsByStatusAndDateRange({
      status,
      startDate,
      endDate,
      driverUniqueId,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error in getRefundsByStatusAndDateRange:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch refunds",
    });
  }
};

exports.updateRefund = async (req, res) => {
  try {
    const { driverRefundUniqueId } = req.params;
    console.log("@driverRefundUniqueId", driverRefundUniqueId);

    const data = req.body;

    const result = await service?.updateDriverRefundByUniqueId(
      driverRefundUniqueId,
      data
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Refund update error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update refund",
    });
  }
};
