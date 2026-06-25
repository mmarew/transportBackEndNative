const smsSenderService = require("../Services/SMSSender.service");
const ServerResponder = require("../Utils/ServerResponder");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// controller createSMSSender
const createSMSSender = async (req, res, next) => {
  try {
    const { phoneNumber, password } = req.body;

    const SMSSenderCreatedBy = req.user?.userUniqueId;

    const result = await executeInTransaction(async () => {
      return await smsSenderService.createSMSSender({
        phoneNumber,
        password,
        SMSSenderCreatedBy,
      });
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getAllSMSSenders = async (req, res, next) => {
  try {
    const result = await smsSenderService.getAllSMSSenders();
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const getSMSSenderById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await smsSenderService.getSMSSenderById(id);
    if (!result) {
      return next(new AppError("SMS sender not found", 404));
    }
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const updateSMSSender = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { phoneNumber, password } = req.body;
    const result = await executeInTransaction(async () => {
      return await smsSenderService.updateSMSSender(id, {
        phoneNumber,
        password,
      });
    });
    if (result.affectedRows === 0) {
      return next(new AppError("SMS sender not found", 404));
    }
    ServerResponder(res, { message: "SMS sender updated successfully" });
  } catch (error) {
    next(error);
  }
};

const deleteSMSSender = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await executeInTransaction(async () => {
      return await smsSenderService.deleteSMSSender(id);
    });
    if (result.affectedRows === 0) {
      return next(new AppError("SMS sender not found", 404));
    }
    ServerResponder(res, { message: "SMS sender deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createSMSSender,
  getAllSMSSenders,
  getSMSSenderById,
  updateSMSSender,
  deleteSMSSender,
};
