const commissionRateService = require("../Services/CommissionRates.service");
const { v4: uuidv4 } = require("uuid");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new commission rate
const createCommissionRate = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const commissionRateUniqueId = uuidv4();
      const {
        commissionRate,
        commissionRateEffectiveDate,
        commissionRateExpirationDate,
      } = req.body;
      const user = req.user;
      const userUniqueId = user.userUniqueId;

      return await commissionRateService.createCommissionRate({
        commissionRateUniqueId,
        commissionRate,
        commissionRateEffectiveDate,
        commissionRateExpirationDate,
        commissionRateCreatedBy: userUniqueId,
      });
    });
    ServerResponder(res, result, 201);
  } catch (error) {
    next(error);
  }
};

// Retrieve all commission rates with pagination and filtering
const getAllCommissionRates = async (req, res, next) => {
  try {
    const commissionRates = await commissionRateService.getAllCommissionRates(
      req.query,
    );
    ServerResponder(res, commissionRates);
  } catch (error) {
    next(error);
  }
};

// Update a commission rate by its unique ID
const updateCommissionRateByUniqueId = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const { commissionRateUniqueId } = req.params;
      const {
        commissionRate,
        commissionRateEffectiveDate,
        commissionRateExpirationDate,
      } = req.body;

      return await commissionRateService.updateCommissionRateByUniqueId({
        commissionRateUniqueId,
        commissionRate,
        commissionRateEffectiveDate,
        commissionRateExpirationDate,
        commissionRateUpdatedBy: req.user.userUniqueId,
      });
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Soft delete a commission rate by its unique ID
const deleteCommissionRateByUniqueId = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const { commissionRateUniqueId } = req.params;

      return await commissionRateService.deleteCommissionRateByUniqueId({
        commissionRateUniqueId,
        commissionRateDeletedBy: req.user.userUniqueId,
      });
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCommissionRate,
  getAllCommissionRates,
  updateCommissionRateByUniqueId,
  deleteCommissionRateByUniqueId,
};
