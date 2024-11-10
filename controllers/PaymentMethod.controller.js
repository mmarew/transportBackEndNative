const paymentMethodService = require("../Services/PaymentMethod.service");

// Create a new payment method
exports.createPaymentMethod = async (req, res) => {
  try {
    const { paymentMethod } = req.body;
    const result = await paymentMethodService.createPaymentMethod({
      paymentMethod,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating payment method:", error);
    res.status(500).json({ message: "Error creating payment method", error });
  }
};

// Get all payment methods
exports.getAllPaymentMethods = async (req, res) => {
  try {
    const result = await paymentMethodService.getAllPaymentMethods();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching payment methods:", error);
    res.status(500).json({ message: "Error fetching payment methods", error });
  }
};

// Get a specific payment method by ID
exports.getPaymentMethodById = async (req, res) => {
  try {
    const { paymentMethodUniqueId } = req.params;
    const result = await paymentMethodService.getPaymentMethodById(
      paymentMethodUniqueId
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching payment method:", error);
    res.status(500).json({ message: "Error fetching payment method", error });
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
    res.status(200).json(result);
  } catch (error) {
    console.error("Error updating payment method:", error);
    res.status(500).json({ message: "Error updating payment method", error });
  }
};

// Delete a specific payment method by ID
exports.deletePaymentMethod = async (req, res) => {
  try {
    const { paymentMethodUniqueId } = req.params;
    const result = await paymentMethodService.deletePaymentMethod(
      paymentMethodUniqueId
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error deleting payment method:", error);
    res.status(500).json({ message: "Error deleting payment method", error });
  }
};
