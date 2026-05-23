"use strict";

const batchCreate = require("./batchCreate.service");
const batchRead = require("./batchRead.service");
const batchUpdate = require("./batchUpdate.service");
const batchDelete = require("./batchDelete.service");
const batchCancel = require("./batchCancel.service");

module.exports = {
  upsertBatch: batchCreate.upsertBatch,
  getBatches: batchRead.getBatches,
  getCancellableSlots: batchRead.getCancellableSlots,
  updateBatch: batchUpdate.updateBatch,
  deleteBatch: batchDelete.deleteBatch,
  cancelBatch: batchCancel.cancelBatch,
  sendBatchCancelNotifications: batchCancel.sendBatchCancelNotifications,
  partialCancelBatch: batchCancel.partialCancelBatch,
};