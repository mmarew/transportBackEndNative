"use strict";

const { db } = require("../../CompanyHelper.service");
const AppError = require("../../../Utils/AppError");

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
const assertAssignableVehicle = async ({ companyUniqueId, vehicleUniqueId }) => {
  if (!vehicleUniqueId) {
    throw new AppError("vehicleUniqueId is required", AppError.BAD_REQUEST);
  }

  const [[vehicle]] = await db().query(
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

module.exports = { assertAssignableVehicle };
