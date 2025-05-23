const service = require("../Services/DriverBalanceTransfer.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.createTransfer = async (req, res) => {
  try {
    const { fromDriverUniqueId, toDriverUniqueId, transferredAmount, reason } =
      req.body;
    let transferredBy = req?.params?.transferredBy;
    const user = req.user;
    const userUniqueId = user?.userUniqueId;
    if (transferredBy == "self") transferredBy = userUniqueId;

    const result = await service.createTransfer(
      fromDriverUniqueId,
      toDriverUniqueId,
      transferredAmount,
      reason,
      transferredBy
    );

    ServerResponder(res, result);
  } catch (error) {
    console.error("Transfer creation error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create transfer",
    });
  }
};

exports.getAllTransfers = async (req, res) => {
  try {
    const result = await service.getAllTransfers();
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch transfers",
    });
  }
};

exports.getTransferByUniqueId = async (req, res) => {
  try {
    const { depositTransferUniqueId } = req.params;
    const result = await service.getTransferByUniqueId(depositTransferUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    console.log("@getTransferByUniqueId error", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch transfer",
    });
  }
};

exports.getTransfersByFromDriverId = async (req, res) => {
  try {
    const { fromDriverUniqueId } = req.params;
    const result = await service.getTransfersByFromDriverId(fromDriverUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch transfers",
    });
  }
};

exports.getTransfersByToDriverId = async (req, res) => {
  try {
    const { toDriverUniqueId } = req.params;
    const result = await service.getTransfersByToDriverId(toDriverUniqueId);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch transfers",
    });
  }
};

exports.deleteTransferByUniqueId = async (req, res) => {
  try {
    const { depositTransferUniqueId } = req.params;
    const result = await service.deleteTransferByUniqueId(
      depositTransferUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete transfer",
    });
  }
};
