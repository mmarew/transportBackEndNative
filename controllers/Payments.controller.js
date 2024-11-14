const paymentsService = require("../Services/Payments.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new payment
exports.createPayment = async (req, res) => {
  try {
    const {
      journeyId,
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime,
    } = req.body;
    const result = await paymentsService.createPayment(
      journeyId,
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating payment:", error);
    ServerResponder(res, { message: "error", error: "Error creating payment" });
  }
};

// Get all payments
exports.getAllPayments = async (req, res) => {
  try {
    const result = await paymentsService.getAllPayments();
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching payments:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching payments",
    });
  }
};

// Get a specific payment by ID
exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentsService.getPaymentById(id);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching payment:", error);
    ServerResponder(res, { message: "error", error: "Error fetching payment" });
  }
};

// Update a specific payment by ID
exports.updatePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime,
    } = req.body;
    const result = await paymentsService.updatePayment(
      id,
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating payment:", error);
    ServerResponder(res, { message: "error", error: "Error updating payment" });
  }
};

// Delete a specific payment by ID
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentsService.deletePayment(id);
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting payment:", error);
    ServerResponder(res, { message: "error", error: "Error deleting payment" });
  }
};
