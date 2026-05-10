"use strict";

const service = require("../Services/ShipperRequestBatch.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const logger = require("../Utils/logger");

/**
 * GET /api/shipperRequestBatch
 * Returns a paginated list filtered by any combination of query params.
 * Pass ?batchUniqueId=<uuid> to fetch a single specific batch.
 */
exports.getBatches = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getBatches(req.query));
  } catch (e) {
    next(e);
  }
};

/**
 * PATCH /api/shipper-request-batches/:batchUniqueId
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
 * DELETE /api/shipper-request-batches/:batchUniqueId
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

/**
 * PUT /api/shipperRequestBatch/:batchUniqueId/cancel
 *
 * Atomically cancels the whole freight batch in one DB transaction:
 *   - ShipperRequestBatch row → cancelled
 *   - All ShipperRequest rows in batch → cancelled
 *   - All JourneyDecisions for those rows → cancelled
 *   - Matched DriverRequest rows → released back to waiting
 *   - CompanyBidRequest submitted offers → expired
 *   - CompanyBidVehicleAssignment records → cancelled
 *
 * After the transaction commits:
 *   - WebSocket notification fired to all companies that had bids
 *   - WebSocket + FCM notification fired to any drivers linked to this batch
 *
 * Body (optional): { cancellationReasonsTypeId }
 */
exports.cancelBatch = async (req, res, next) => {
  try {
    const { userUniqueId, roleId } = req.user;
    const { batchUniqueId } = req.params;
    const { cancellationReasonsTypeId } = req.body || {};

    const result = await executeInTransaction(() =>
      service.cancelBatch({
        batchUniqueId,
        userUniqueId,
        roleId,
        cancellationReasonsTypeId: cancellationReasonsTypeId || null,
      }),
    );

    // ── Strip internal notification targets before sending HTTP response ─────
    const notificationTargets = result._notificationTargets;
    delete result._notificationTargets;

    // ── Respond immediately — don't hold the HTTP connection for notifications ──
    ServerResponder(res, result, 200);

    // ── Fire notifications after commit (fire-and-forget) ─────────────────
    // Errors here must never bubble up — the DB is already committed.
    if (notificationTargets) {
      service.sendBatchCancelNotifications(notificationTargets).catch((err) =>
        logger.error("cancelBatch: notification dispatch failed", {
          batchUniqueId,
          error: err.message,
        }),
      );
    }
  } catch (e) {
    next(e);
  }
};
