"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  getData
} = require("../../../CRUD/Read/ReadData");

const {
  currentDate,
  
} = require("../../../Utils/CurrentDate");
const {
  deleteFile
} = require("../../../Utils/FileUtils");
const logger = require("../../../Utils/logger");
const AppError = require("../../../Utils/AppError");
const {
  transactionStorage
} = require("../../../Utils/TransactionContext");
const {
  USER_STATUS,
  statusList,
  usersRoles,
} = require("../../../Utils/ListOfSeedData");
const Config = require("../../../Utils/Config");

// The system super-admin account is non-deletable. Protection is derived from
// env config (SUPER_ADMIN_PHONE) OR from holding the super-admin role — no
// hardcoded phone values in source. Rows are normalized to digits for the phone
// comparison.
const SUPER_ADMIN_PHONE_DIGITS = Config.SUPER_ADMIN.PHONE
  ? Config.SUPER_ADMIN.PHONE.replace(/\D/g, "")
  : null;







const deleteUser = async ({
  userUniqueId,
  deletedBy,
  retainFiles = true
}, connection = null) => {
  if (!userUniqueId) {
    throw new AppError("userUniqueId is required to delete user", AppError.BAD_REQUEST);
  }
  const executor = transactionStorage.getStore() || connection || pool;

  // Never allow deleting the system super-admin account. An account is
  // protected when its phone matches the env-configured SUPER_ADMIN_PHONE, or
  // when it holds the system (5) / supper admin (6) role.
  const [targetRows] = await executor.query(
    `SELECT
       u.userUniqueId,
       u.phoneNumber,
       (SELECT COUNT(*) FROM UserRole ur
        WHERE ur.userUniqueId = u.userUniqueId
          AND ur.roleId IN (?, ?)
          AND ur.userRoleDeletedAt IS NULL) AS protectedRoleCount
     FROM Users u
     WHERE u.userUniqueId = ? AND u.userDeletedAt IS NULL
     LIMIT 1`,
    [usersRoles.systemRoleId, usersRoles.supperAdminRoleId, userUniqueId]
  );
  if (!targetRows || targetRows.length === 0) {
    throw new AppError("User not found or already deleted", AppError.NOT_FOUND);
  }
  const targetPhoneDigits = (targetRows[0]?.phoneNumber || "").replace(/\D/g, "");
  const holdsProtectedRole = Number(targetRows[0]?.protectedRoleCount || 0) > 0;
  if (holdsProtectedRole || (SUPER_ADMIN_PHONE_DIGITS && targetPhoneDigits === SUPER_ADMIN_PHONE_DIGITS)) {
    throw new AppError("The system super admin account cannot be deleted", AppError.FORBIDDEN);
  }

  const userDeletedAt = currentDate();
  const isDeleted = true;
  const sql = "UPDATE Users SET userDeletedAt = ?, userDeletedBy = ?, isDeleted = ? WHERE userUniqueId = ?";
  const values = [userDeletedAt, deletedBy, isDeleted, userUniqueId];
  const [deleteResults] = await executor.query(sql, values);
  if (deleteResults.affectedRows === 0) {
    throw new AppError("User not found or already deleted", AppError.NOT_FOUND);
  }

  // Ensure status 8 (ACCOUNT_DELETED) exists for FK, then set all this user's role statuses to it
  const statusDeleted = statusList.find(s => s.statusId === USER_STATUS.ACCOUNT_DELETED);
  if (statusDeleted) {
    const {
      statusId: sid,
      statusUniqueId,
      statusName,
      statusDescription
    } = statusDeleted;
    await executor.query(`INSERT INTO Statuses (statusId, statusUniqueId, statusName, statusDescription, statusCreatedBy, statusCreatedAt)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE statusName = VALUES(statusName), statusDescription = VALUES(statusDescription)`, [sid, statusUniqueId, statusName, statusDescription, deletedBy, currentDate()]);
    await executor.query(`UPDATE UserRoleStatusCurrent SET statusId = ? WHERE userRoleId IN (SELECT userRoleId FROM UserRole WHERE userUniqueId = ?)`, [USER_STATUS.ACCOUNT_DELETED, userUniqueId]);
  }
  if (retainFiles === false) {
    const documents = await getData({
      tableName: "AttachedDocuments",
      conditions: {
        userUniqueId
      },
      connection: executor
    });
    for (const doc of documents || []) {
      if (doc.attachedDocumentName) {
        try {
          deleteFile(doc.attachedDocumentName);
        } catch (err) {
          logger.warn("deleteUser: failed to delete file", {
            attachedDocumentUniqueId: doc.attachedDocumentUniqueId,
            error: err?.message
          });
        }
      }
      const {
        deleteData: deleteDataFunc
      } = require("../../../CRUD/Delete/DeleteData"); // Safer import
      await deleteDataFunc({
        tableName: "AttachedDocuments",
        conditions: {
          attachedDocumentUniqueId: doc.attachedDocumentUniqueId
        }
      });
    }
  }
  return {
    message: "User deleted",
    data: null
  };
};

module.exports = {
  deleteUser
};
