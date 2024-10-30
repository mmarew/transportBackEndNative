const paymentStatusService = require("../services/paymentStatus.service");

// Create a new payment status
exports.createPaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    const result = await paymentStatusService.createPaymentStatus({
      paymentStatus,
    });
    res.status(201).json(result);
  } catch (error) {
    console.error("Error creating payment status:", error);
    res.status(500).json({ message: "Error creating payment status", error });
  }
};

// Get all payment statuses
exports.getAllPaymentStatuses = async (req, res) => {
  try {
    const result = await paymentStatusService.getAllPaymentStatuses();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching payment statuses:", error);
    res.status(500).json({ message: "Error fetching payment statuses", error });
  }
};

// Get a specific payment status by ID
exports.getPaymentStatusById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentStatusService.getPaymentStatusById(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error fetching payment status:", error);
    res.status(500).json({ message: "Error fetching payment status", error });
  }
};

// Update a specific payment status by ID
exports.updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    const result = await paymentStatusService.updatePaymentStatus(
      id,
      paymentStatus
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("Error updating payment status:", error);
    res.status(500).json({ message: "Error updating payment status", error });
  }
};

// Delete a specific payment status by ID
exports.deletePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await paymentStatusService.deletePaymentStatus(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error deleting payment status:", error);
    res.status(500).json({ message: "Error deleting payment status", error });
  }
};
