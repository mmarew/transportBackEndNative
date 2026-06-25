const paymentsService = require("../Services/Payments.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new payment
exports.createPayment = async (req, res, next) => {
  try {
    const {
      journeyId,
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime,
    } = req.body;
    const user = req.user;
    const result = await executeInTransaction(async () => {
      return await paymentsService.createPayment(
        journeyId,
        amount,
        paymentMethodUniqueId,
        paymentStatusUniqueId,
        paymentTime,
        user,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get all payments
exports.getAllPayments = async (req, res, next) => {
  try {
    const result = await paymentsService.getAllPayments();
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.getPaymentsByUserUniqueId = async (req, res, next) => {
  try {
    const params = req.params;
    let userUniqueId = params?.userUniqueId;
    const user = req?.user;

    if (params?.userUniqueId === "self") {
      userUniqueId = user?.userUniqueId;
    }
    const result = await paymentsService.getPaymentsByUserUniqueId(
      params,
      userUniqueId,
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get a specific payment by ID
exports.getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await paymentsService.getPaymentById(id);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a specific payment by ID
exports.updatePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      paymentTime,
    } = req.body;
    const result = await executeInTransaction(async () => {
      return await paymentsService.updatePayment(
        id,
        amount,
        paymentMethodUniqueId,
        paymentStatusUniqueId,
        paymentTime,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a specific payment by ID
exports.deletePayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await executeInTransaction(async () => {
      return await paymentsService.deletePayment(id);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
