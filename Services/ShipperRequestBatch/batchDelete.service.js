"use strict";

const AppError = require("../../Utils/AppError");
const { currentDate } = require("../../Utils/CurrentDate");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const messageTypes = require("../../Utils/MessageTypes");
const logger = require("../../Utils/logger");
const {
  sendSocketIONotificationToCompany,
  sendSocketIONotificationToDriver,
  sendSocketIONotificationToShipper,
} = require("../../Utils/Notifications");
const { sendFCMNotificationToUser } = require("../Firebase.service");
const { createCanceledJourney } = require("../CanceledJourneys.service");
const { getData } = require("../../CRUD/Read/ReadData");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("../CompanyHelper.service");
const { UPDATABLE_COLS, assertCompanyCancellationReason } = require("./batchHelper");

/**
 * Soft-delete a batch by stamping `batchDeletedAt`.
 *
 * @param {string} batchUniqueId
 * @returns {Promise<Object>}
 */
exports.deleteBatch = async (batchUniqueId) => {
  const [res] = await db().query(
    `UPDATE ShipperRequestBatch
     SET batchDeletedAt = ?
     WHERE batchUniqueId = ? AND batchDeletedAt IS NULL`,
    [currentDate(), batchUniqueId],
  );

  if (res.affectedRows === 0) {
    throw new AppError("Batch not found or already deleted", 404);
  }

  return { message: "success", data: "Batch deleted" };
};

// ── CANCEL (company batch) ────────────────────────────────────────────────────────
