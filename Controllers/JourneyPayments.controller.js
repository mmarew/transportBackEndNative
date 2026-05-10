const journeyPaymentsService = require("../Services/JourneyPayments.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new journey payment
exports.createJourneyPayment = async (req, res, next) => {
  try {
    const {
      journeyDecisionUniqueId,
      amount,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
    } = req.body;

    const result = await executeInTransaction(async () => {
      return await journeyPaymentsService.createJourneyPayment({
        journeyDecisionUniqueId,
        amount,
        paymentMethodUniqueId,
        paymentStatusUniqueId,
      });
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get all journey payments with pagination and filtering
exports.getAllJourneyPayments = async (req, res, next) => {
  try {
    const {
      page,
      limit,
      sortBy,
      sortOrder,
      journeyDecisionUniqueId,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      amountMin,
      amountMax,
      paymentTimeFrom,
      paymentTimeTo,
      driverUniqueId,
      shipperUniqueId,
    } = req.query;

    const result = await journeyPaymentsService.getAllJourneyPayments({
      page,
      limit,
      sortBy,
      sortOrder,
      journeyDecisionUniqueId,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
      amountMin,
      amountMax,
      paymentTimeFrom,
      paymentTimeTo,
      driverUniqueId,
      shipperUniqueId,
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get a specific journey payment by ID
exports.getJourneyPaymentById = async (req, res, next) => {
  try {
    const { paymentUniqueId } = req.params;

    const result =
      await journeyPaymentsService.getJourneyPaymentById(paymentUniqueId);

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a specific journey payment by ID
exports.updateJourneyPayment = async (req, res, next) => {
  try {
    const { paymentUniqueId } = req.params;
    const { amount, paymentMethodUniqueId, paymentStatusUniqueId } = req.body;

    const result = await executeInTransaction(async () => {
      return await journeyPaymentsService.updateJourneyPayment({
        paymentUniqueId,
        amount,
        paymentMethodUniqueId,
        paymentStatusUniqueId,
        user: req.user,
      });
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a specific journey payment by ID
exports.deleteJourneyPayment = async (req, res, next) => {
  try {
    const { paymentUniqueId } = req.params;

    const result = await executeInTransaction(async () => {
      return await journeyPaymentsService.deleteJourneyPayment(paymentUniqueId);
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
