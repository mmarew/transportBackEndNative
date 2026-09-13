"use strict";

const { pool } = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { currentDate } = require("../../Utils/CurrentDate");
const { ADMIN_ROLE_IDS } = require("./helpers");

// Delete a delivery confirmation (soft delete). Settled (CONFIRMED) records are
// evidence and can only be deleted by an admin (roleId ∈ {3, 6}); the soft-delete
// columns record who and when.
exports.deleteDeliveryConfirmation = async (
  deliveryConfirmationUniqueId,
  deletedBy,
  roleId,
) => {
  const executor = transactionStorage.getStore() || pool;
  const isAdmin = ADMIN_ROLE_IDS.has(Number(roleId));

  const [rows] = await executor.query(
    `SELECT deliveryConfirmationStatus FROM DeliveryConfirmations
     WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
    [deliveryConfirmationUniqueId],
  );
  const current = rows[0];
  if (!current) {
    throw new AppError("Delivery confirmation not found", AppError.NOT_FOUND);
  }
  if (current.deliveryConfirmationStatus === "CONFIRMED" && !isAdmin) {
    throw new AppError(
      "A confirmed delivery confirmation cannot be deleted",
      AppError.FORBIDDEN,
    );
  }

  const sql = `
    UPDATE DeliveryConfirmations
    SET deliveryConfirmationDeletedBy = ?, deliveryConfirmationDeletedAt = ?
    WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL
  `;
  const values = [deletedBy, currentDate(), deliveryConfirmationUniqueId];
  const [result] = await executor.query(sql, values);

  if (result.affectedRows > 0) {
    return {
      message: `Delivery confirmation ${deliveryConfirmationUniqueId} deleted successfully`,
      data: null,
    };
  }
  throw new AppError(
    "Failed to delete delivery confirmation",
    AppError.INTERNAL_SERVER_ERROR,
  );
};
