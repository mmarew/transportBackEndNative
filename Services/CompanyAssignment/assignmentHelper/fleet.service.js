"use strict";

const { db } = require("../../CompanyHelper.service");
const AppError = require("../../../Utils/AppError");
const logger = require("../../../Utils/logger");

/**
 * assertAssignableVehicle
 * ───────────────────────
 * Vehicle-side fence for every assignment path (single, bulk, replace): the
 * truck must exist, belong to the company that submitted the bid, and still be
 * `assignmentStatus = 'active'` in that company's fleet.
 *
 * This is the manual-assign counterpart of the auto-assigner's SQL filter
 * (`assignmentAuto.service.js:141`), which already required `cv.assignmentStatus
 * = 'active'` — before this helper the manual/bulk paths had no vehicle check at
 * all, so a dispatcher could put a retired or foreign truck on a job.
 *
 * `inactive` is the dispatcher-controlled pool flag: a vehicle goes `inactive`
 * when its driver is pulled off a job (recall / cancel-after-accept) and only a
 * dispatcher re-frees it with `PATCH /api/company/fleet/:vehicleUniqueId`.
 *
 * @param {Object} opts
 * @param {string} opts.companyUniqueId - company that owns the bid
 * @param {string} opts.vehicleUniqueId - truck to assign
 * @returns {Promise<object>} the CompanyVehicle row
 * @throws {AppError} 404 unknown vehicle, 403 other company's truck, 409 not active
 */
const assertAssignableVehicle = async ({ companyUniqueId, vehicleUniqueId, companyVehicleUniqueId }) => {
  const lookupId = companyVehicleUniqueId || vehicleUniqueId;
  if (!lookupId) {
    throw new AppError("vehicleUniqueId is required", AppError.BAD_REQUEST);
  }

  const [[vehicle]] = companyVehicleUniqueId
    ? await db().query(
        `SELECT cv.vehicleUniqueId, cv.companyUniqueId, cv.assignmentStatus,
                cv.companyVehicleDeletedAt
           FROM CompanyVehicle cv
          WHERE cv.companyVehicleUniqueId = ?
          LIMIT 1`,
        [companyVehicleUniqueId],
      )
    : await db().query(
        `SELECT cv.vehicleUniqueId, cv.companyUniqueId, cv.assignmentStatus,
                cv.companyVehicleDeletedAt
           FROM CompanyVehicle cv
          WHERE cv.vehicleUniqueId = ?
          LIMIT 1`,
        [vehicleUniqueId],
      );

  if (!vehicle || vehicle.companyVehicleDeletedAt) {
    throw new AppError("Vehicle not found in any company fleet", AppError.NOT_FOUND);
  }

  if (companyUniqueId && vehicle.companyUniqueId !== companyUniqueId) {
    throw new AppError(
      "Vehicle does not belong to this company's fleet",
      AppError.FORBIDDEN,
    );
  }

  if (vehicle.assignmentStatus !== "active") {
    throw new AppError(
      "Vehicle is not active in the fleet. A dispatcher must re-free it (PATCH /api/company/fleet/:companyVehicleUniqueId) before it can be assigned.",
      AppError.CONFLICT,
    );
  }

  return vehicle;
};

/**
 * maybeInactivateVehicleOnRepeatedPreconfirmRejection
 * ────────────────────────────────────────────────────
 * Policy: if a driver rejects (pre-confirm, `rejected_by_driver`) company
 * assignments 2+ times within the same `shipperRequestBatchUniqueId`, set the
 * current vehicle to inactive. This signals the driver doesn't want the job for
 * that batch and requires dispatcher re-free.
 *
 * Keeps existing rule: `cancelled_by_driver` (post-confirm) inactivates on 1st
 * cancellation (handled elsewhere).
 *
 * @param {Object} opts
 * @param {object} opts.executor - db() or transaction connection
 * @param {string} [opts.assignmentUniqueId]
 * @param {string} [opts.driverRequestUniqueId]
 * @param {string} [opts.driverUserUniqueId]
 * @param {string} [opts.shipperRequestBatchUniqueId]
 * @param {string} [opts.vehicleUniqueId]
 * @returns {Promise<{inactivated:boolean, reason?:string, count?:number}>}
 */
const maybeInactivateVehicleOnRepeatedPreconfirmRejection = async (opts = {}) => {
  const {
    executor,
    assignmentUniqueId,
    driverRequestUniqueId,
    driverUserUniqueId,
    shipperRequestBatchUniqueId,
    vehicleUniqueId,
  } = opts;
  const exec = executor || db();

  try {
    let ctx = null;
    if (assignmentUniqueId) {
      const [rows] = await exec.query(
        `SELECT cba.assignmentUniqueId, cba.driverUserUniqueId, cba.vehicleUniqueId,
                cba.assignmentStatus, cbr.shipperRequestBatchUniqueId
           FROM CompanyBidVehicleAssignment cba
           JOIN CompanyBidRequest cbr ON cbr.companyBidRequestUniqueId = cba.companyBidRequestUniqueId
          WHERE cba.assignmentUniqueId = ?
            AND cba.assignmentDeletedAt IS NULL
          LIMIT 1`,
        [assignmentUniqueId],
      );
      ctx = rows?.[0] || null;
    } else if (driverRequestUniqueId) {
      const [rows] = await exec.query(
        `SELECT cba.assignmentUniqueId, cba.driverUserUniqueId, cba.vehicleUniqueId,
                cba.assignmentStatus, cbr.shipperRequestBatchUniqueId
           FROM CompanyBidVehicleAssignment cba
           JOIN CompanyBidRequest cbr ON cbr.companyBidRequestUniqueId = cba.companyBidRequestUniqueId
          WHERE cba.driverRequestUniqueId = ?
            AND cba.assignmentDeletedAt IS NULL
          ORDER BY cba.assignmentCreatedAt DESC
          LIMIT 1`,
        [driverRequestUniqueId],
      );
      ctx = rows?.[0] || null;
    }

    const resolvedDriver = driverUserUniqueId || ctx?.driverUserUniqueId;
    const resolvedBatch = shipperRequestBatchUniqueId || ctx?.shipperRequestBatchUniqueId;
    const resolvedVehicle = vehicleUniqueId || ctx?.vehicleUniqueId;
    const resolvedAssignment = assignmentUniqueId || ctx?.assignmentUniqueId;

    if (!resolvedDriver || !resolvedBatch || !resolvedVehicle) {
      return { inactivated: false, reason: "missing_context" };
    }

    // Count pre-confirm rejections by this driver in this batch.
    // If excludeAssignmentUniqueId is provided (assignment not yet updated to rejected_by_driver),
    // threshold is met when prior count >= 1 (this becomes 2nd).
    const excludeId = opts.excludeAssignmentUniqueId || null;
    const countSql = excludeId
      ? `SELECT COUNT(*) AS cnt
           FROM CompanyBidVehicleAssignment cba
           JOIN CompanyBidRequest cbr ON cbr.companyBidRequestUniqueId = cba.companyBidRequestUniqueId
          WHERE cba.driverUserUniqueId = ?
            AND cbr.shipperRequestBatchUniqueId = ?
            AND cba.assignmentStatus = 'rejected_by_driver'
            AND cba.assignmentDeletedAt IS NULL
            AND cba.assignmentUniqueId <> ?`
      : `SELECT COUNT(*) AS cnt
           FROM CompanyBidVehicleAssignment cba
           JOIN CompanyBidRequest cbr ON cbr.companyBidRequestUniqueId = cba.companyBidRequestUniqueId
          WHERE cba.driverUserUniqueId = ?
            AND cbr.shipperRequestBatchUniqueId = ?
            AND cba.assignmentStatus = 'rejected_by_driver'
            AND cba.assignmentDeletedAt IS NULL`;
    const countParams = excludeId
      ? [resolvedDriver, resolvedBatch, excludeId]
      : [resolvedDriver, resolvedBatch];
    const [countRows] = await exec.query(countSql, countParams);
    const priorCount = Number(countRows?.[0]?.cnt || 0);
    const effectiveCount = excludeId ? priorCount + 1 : priorCount;

    if ((excludeId ? priorCount >= 1 : priorCount >= 2)) {
      await exec.query(
        `UPDATE CompanyVehicle
            SET assignmentStatus = 'inactive'
          WHERE vehicleUniqueId = ?
            AND companyVehicleDeletedAt IS NULL`,
        [resolvedVehicle],
      );
      logger.info("Vehicle inactivated after repeated pre-confirm batch rejections", {
        driverUserUniqueId: resolvedDriver,
        shipperRequestBatchUniqueId: resolvedBatch,
        vehicleUniqueId: resolvedVehicle,
        assignmentUniqueId: resolvedAssignment,
        rejectionCount: effectiveCount,
      });
      return { inactivated: true, count: effectiveCount };
    }

    return { inactivated: false, count: effectiveCount };
  } catch (e) {
    logger.warn("maybeInactivateVehicleOnRepeatedPreconfirmRejection failed", {
      error: e.message,
      assignmentUniqueId,
      driverRequestUniqueId,
    });
    return { inactivated: false, reason: "error" };
  }
};

module.exports = {
  assertAssignableVehicle,
  maybeInactivateVehicleOnRepeatedPreconfirmRejection,
};
