const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const service = require("../Services/UserDeposit");
const { currentDate } = require("../Utils/CurrentDate");
const { HTTP_STATUS, PAGINATION } = require("../Utils/Constants");

// Create
exports.createUserDeposit = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const driverUniqueId = req?.user?.userUniqueId;
      req.body.driverUniqueId = driverUniqueId;
      req.body.userDepositCreatedBy = driverUniqueId;
      const depositTime = currentDate();
      req.body.depositTime = depositTime;
      return await service.createUserDeposit(req.body);
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.getUserDeposit = async (req, res, next) => {
  try {
    const query = req.query;

    let driverUniqueId = req?.query?.userUniqueId;
    if (driverUniqueId === "self") {
      driverUniqueId = req?.user?.userUniqueId;
    }
    const filter = {
      ...query,
      driverUniqueId,
      page: parseInt(query?.page) || 1,
      limit: parseInt(query?.limit) || PAGINATION.DEFAULT_PAGE_SIZE,
      sortBy: query?.sortBy || "depositTime",
      sortOrder: query?.sortOrder || "DESC",
    };

    const result = await service.getUserDeposit({
      ...filter,
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update
exports.updateUserDepositByUniqueId = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const user = req?.user;
      const userUniqueId = user?.userUniqueId;
      const body = { ...req.body, userDepositCreatedOrUpdatedBy: userUniqueId };
      const { userDepositUniqueId } = req.params;
      return await service.updateUserDepositByUniqueId(
        userDepositUniqueId,
        body,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete
exports.deleteUserDepositByUniqueId = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const user = req?.user;
      const userDepositDeletedBy = user?.userUniqueId;
      const { userDepositUniqueId } = req.params;
      return await service.deleteUserDepositByUniqueId(
        userDepositUniqueId,
        userDepositDeletedBy,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.initiateSantimPayPayment = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      const driverUniqueId = req?.user?.userUniqueId;
      const phoneNumber = req?.user?.phoneNumber;
      const { depositAmount } = req.body;

      if (!depositAmount || depositAmount <= 0) {
        const AppError = require("../Utils/AppError");
        throw new AppError("Valid deposit amount is required", AppError.BAD_REQUEST);
      }

      if (!phoneNumber) {
        const AppError = require("../Utils/AppError");
        throw new AppError(
          "Phone number not found in user profile. Please update your profile.",
          AppError.BAD_REQUEST,
        );
      }

      return await service.initiateSantimPayPaymentService({
        driverUniqueId,
        depositAmount,
        phoneNumber: phoneNumber || "",
      });
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

exports.handleSantimPayWebhook = async (req, res) => {
  try {
    const result = await executeInTransaction(async () => {
      const webhookData = req.body;
      const signedToken =
        req.headers["signed-token"] || req.headers["Signed-Token"];

      return await service.handleSantimPayWebhookService({
        webhookData,
        signedToken,
      });
    });

    // Always return 200 to SantimPay to acknowledge receipt
    ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    // Still return 200 to prevent SantimPay from retrying, but log it locally if needed
    // or just return a controlled error response with 200
    ServerResponder(
      res,
      {
        status: "error",
        error: error.message || "Webhook processing failed",
      },
      HTTP_STATUS.OK,
    );
  }
};

// Webhook handler

exports.getSignedToken = async (req, res, next) => {
  try {
    const result = await service.getSignedTokenService(req.body);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
