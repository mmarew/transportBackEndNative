"use strict";

const service = require("../Services/PassengerRequestBatch.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

/**
 * GET /api/passenger-request-batches
 * Returns a paginated list filtered by any combination of query params.
 */
exports.getBatches = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getBatches(req.query));
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/passenger-request-batches/:batchUniqueId
 * Returns a single batch by its UUID.
 */
exports.getBatchById = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getBatchById(req.params.batchUniqueId));
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/passenger-request-batches/:batchUniqueId
 * Partially updates only the fields supplied in req.body.
 */
exports.updateBatch = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateBatch(
        req.params.batchUniqueId,
        req.body,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

/**
 * DELETE /api/passenger-request-batches/:batchUniqueId
 * Soft-deletes the batch (stamps batchDeletedAt).
 */
exports.deleteBatch = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteBatch(req.params.batchUniqueId, req.user.userUniqueId),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
