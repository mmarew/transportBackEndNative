const service = require("../Services/DriverRefund.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createDriverRefund = async (req, res) => {
  try {
    let refundedBy = req?.params?.refundedBy;
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;

    if (refundedBy == "self") {
      refundedBy = userUniqueId;
    }

    const { driverUniqueId, refundAmount, refundReason } = req.body;
    const result = await service.createDriverRefund(
      driverUniqueId,
      refundAmount,
      refundReason,
      refundedBy
    );
    ServerResponder(res, result);
  } catch (error) {
    console.error("Create refund error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create refund",
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
exports.updateRefundStatusAndUrl = async (req, res) => {
  try {
    const { driverRefundUniqueId } = req.params;
    const { refundStatus, refundUrl } = req.body;

    if (!refundStatus || !refundUrl) {
      return ServerResponder(res, {
        message: "error",
        error: "Both 'refundStatus' and 'refundUrl' are required",
      });
    }

    const result = await service.updateRefundStatusAndUrl({
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
