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
  
} = require("../../../Utils/ListOfSeedData");







const deleteUser = async ({
  userUniqueId,
  deletedBy,
  retainFiles = true
}, connection = null) => {
  if (!userUniqueId) {
    throw new AppError("userUniqueId is required to delete user", 400);
  }
  const userDeletedAt = currentDate();
  const isDeleted = true;
  const sql = "UPDATE Users SET userDeletedAt = ?, userDeletedBy = ?, isDeleted = ? WHERE userUniqueId = ?";
  const values = [userDeletedAt, deletedBy, isDeleted, userUniqueId];
  const executor = transactionStorage.getStore() || connection || pool;
  const [deleteResults] = await executor.query(sql, values);
  if (deleteResults.affectedRows === 0) {
    throw new AppError("User not found or already deleted", 404);
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
    message: "success",
    data: null
  };
};

module.exports = {
  deleteUser
};
