const paymentStatusService = require("../Services/PaymentStatus.service");
const ServerResponder = require("../Utils/ServerResponder");
// Create a new payment status
exports.createPaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const result = await paymentStatusService.createPaymentStatus({
      paymentStatus,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating payment status:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error creating payment status",
    });
  }
};

// Get all payment statuses
exports.getAllPaymentStatuses = async (req, res) => {
  try {
    const result = await paymentStatusService.getAllPaymentStatuses();
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching payment statuses:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching payment statuses",
    });
  }
};

// Get a specific payment status by ID
exports.getPaymentStatusById = async (req, res) => {
  try {
    const { paymentStatusUniqueId } = req.params;
    const result = await paymentStatusService.getPaymentStatusById(
      paymentStatusUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching payment status:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching payment status",
    });
  }
};

// Update a specific payment status by ID
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentStatusUniqueId } = req.params;
    const { paymentStatus } = req.body;
    const result = await paymentStatusService.updatePaymentStatus(
      paymentStatusUniqueId,
      paymentStatus
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating payment status:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error updating payment status",
    });
  }
};

// Delete a specific payment status by ID
exports.deletePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentStatusService.deletePaymentStatus(id);
    res.status(200).json(result);
  } catch (error) {
    console.log("Error deleting payment status:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error deleting payment status",
    });
  }
};
