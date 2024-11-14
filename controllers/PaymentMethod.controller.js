const paymentMethodService = require("../Services/PaymentMethod.service");
const ServerResponder = require("../Utils/ServerResponder");

// Create a new payment method
exports.createPaymentMethod = async (req, res) => {
  try {
    const { paymentMethod } = req.body;
    const result = await paymentMethodService.createPaymentMethod({
      paymentMethod,
    });
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error creating payment method:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error creating payment method",
    });
  }
};

// Get all payment methods
exports.getAllPaymentMethods = async (req, res) => {
  try {
    const result = await paymentMethodService.getAllPaymentMethods();
    res.status(200).json(result);
  } catch (error) {
    console.log("Error fetching payment methods:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching payment methods",
    });
  }
};

// Get a specific payment method by ID
exports.getPaymentMethodById = async (req, res) => {
  try {
    const { paymentMethodUniqueId } = req.params;
    const result = await paymentMethodService.getPaymentMethodById(
      paymentMethodUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error fetching payment method:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error fetching payment method",
    });
  }
};

// Update a specific payment method by ID
exports.updatePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodUniqueId } = req.params;
    const { paymentMethod } = req.body;
    const result = await paymentMethodService.updatePaymentMethod(
      paymentMethodUniqueId,
      paymentMethod
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error updating payment method:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error updating payment method",
    });
  }
};

// Delete a specific payment method by ID
exports.deletePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodUniqueId } = req.params;
    const result = await paymentMethodService.deletePaymentMethod(
      paymentMethodUniqueId
    );
    ServerResponder(res, result);
  } catch (error) {
    console.log("Error deleting payment method:", error);
    ServerResponder(res, {
      message: "error",
      error: "Error deleting payment method",
    });
  }
};
