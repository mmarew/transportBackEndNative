const paymentsService = require("../services/payments.service");

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
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating payment:", error);
    res.status(500).json({ message: "Error creating payment", error });
  }
};

// Get all payments
exports.getAllPayments = async (req, res) => {
  try {
    const result = await paymentsService.getAllPayments();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching payments:", error);
    res.status(500).json({ message: "Error fetching payments", error });
  }
};

// Get a specific payment by ID
exports.getPaymentById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentsService.getPaymentById(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching payment:", error);
    res.status(500).json({ message: "Error fetching payment", error });
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
    res.status(200).json(result);
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ message: "Error updating payment", error });
  }
};

// Delete a specific payment by ID
exports.deletePayment = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentsService.deletePayment(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error deleting payment:", error);
    res.status(500).json({ message: "Error deleting payment", error });
  }
};
