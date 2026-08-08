const paymentMethodService = require("../Services/PaymentMethod.service");
const { usersRoles } = require("../Utils/ListOfSeedData");
const ServerResponder = require("../Utils/ServerResponder");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Create a new payment method
exports.createPaymentMethod = async (req, res, next) => {
  try {
    const { paymentMethod } = req.body;
    const user = req.user;
    const result = await executeInTransaction(async () => {
      return await paymentMethodService.createPaymentMethod({
        paymentMethod,
        user,
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get all payment methods
exports.getAllPaymentMethods = async (req, res, next) => {
  try {
    const result = await paymentMethodService.getAllPaymentMethods(req.query);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a specific payment method by ID
exports.updatePaymentMethod = async (req, res, next) => {
  try {
    const user = req.user;
    const roleId = user.roleId;
    // update can be done via admin or supper admin only
    if (
      roleId !== usersRoles.adminRoleId &&
      roleId !== usersRoles.supperAdminRoleId
    ) {
      throw new AppError("Unauthorized", AppError.FORBIDDEN);
    }
    const { paymentMethodUniqueId } = req.params;
    const { paymentMethod } = req.body;
    const result = await executeInTransaction(async () => {
      return await paymentMethodService.updatePaymentMethod(
        paymentMethodUniqueId,
        { paymentMethod, user },
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a specific payment method by ID
exports.deletePaymentMethod = async (req, res, next) => {
  try {
    const user = req.user;
    const roleId = user.roleId;
    // delete can be done via admin or supper admin only
    if (
      roleId !== usersRoles.adminRoleId &&
      roleId !== usersRoles.supperAdminRoleId
    ) {
      throw new AppError("Unauthorized", AppError.FORBIDDEN);
    }
    const { paymentMethodUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await paymentMethodService.deletePaymentMethod(
        paymentMethodUniqueId,
        req.user,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
