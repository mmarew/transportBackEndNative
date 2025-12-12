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
    if (driverUniqueId == "self") {
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
    const { driverDepositUniqueId, depositStatus, acceptRejectReason } =
      req.body;

    if (!driverDepositUniqueId || !depositStatus) {
      return ServerResponder(res, {
        message: "error",
        error: "Missing driverDepositUniqueId or depositStatus",
      });
    }

    const result = await service?.updateDriverDepositStatusService({
      driverDepositUniqueId,
      newStatus: depositStatus,
      acceptRejectReason,
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

exports.initiateSantimPayPayment = async (req, res) => {
  try {
    const driverUniqueId = req?.user?.userUniqueId;
    const phoneNumber = req?.user?.phoneNumber;
    const { depositAmount } = req.body;

    if (!depositAmount || depositAmount <= 0) {
      return ServerResponder(res, {
        message: "error",
        error: "Valid deposit amount is required",
      });
    }

    if (!phoneNumber) {
      return ServerResponder(res, {
        message: "error",
        error:
          "Phone number not found in user profile. Please update your profile.",
      });
    }

    const result = await service.initiateSantimPayPaymentService({
      driverUniqueId,
      depositAmount,
      phoneNumber: phoneNumber || "",
    });

    // Log payment URL in response for easy access
    if (result.message === "success" && result.data.paymentUrl) {
      console.log("\n========================================");
      console.log("🎯 SANTIMPAY PAYMENT URL (Click to open):");
      console.log("========================================");
      console.log(result.data.paymentUrl);
      console.log("========================================\n");
    }

    ServerResponder(res, result);
  } catch (error) {
    console.error("Initiate SantimPay payment error:", error);
    ServerResponder(res, {
      message: "error",
      error: error.message || "Failed to initiate payment",
    });
  }
};

exports.handleSantimPayWebhook = async (req, res) => {
  try {
    const webhookData = req.body;
    const signedToken =
      req.headers["signed-token"] || req.headers["Signed-Token"];

    console.log("SantimPay Webhook received:", webhookData);
    console.log("Signed Token:", signedToken);

    const result = await service.handleSantimPayWebhookService({
      webhookData,
      signedToken,
    });

    // Always return 200 to SantimPay to acknowledge receipt
    ServerResponder(res, result, 200);
  } catch (error) {
    console.error("SantimPay webhook error:", error);
    // Still return 200 to prevent SantimPay from retrying
    ServerResponder(
      res,
      {
        message: "error",
        error: error.message || "Webhook processing failed",
      },
      200
    );
  }
};
