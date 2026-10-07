"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../Utils/CurrentDate");
const AppError = require("../../Utils/AppError");
const { db } = require("../CompanyHelper.service");
const { journeyStatusMap } = require("../../Utils/ListOfSeedData");
const { assertDriverNotDoubleBooked } = require("../DriverQueue/helpers");
const { getShipperRequestByUniqueId } = require("../ShipperRequest");
const logger = require("../../Utils/logger");

const {
  createJourneyDecisionForAssignment,
  notifyAssignedDriver,
  notifyDriverOfRecall,
  upsertDriverRequest,
  readAssignmentForUpdate,
  recallAssignment,
  assertRecallAccess,
  assertAssignableVehicle,
  isActiveAssignment,
} = require("./assignmentHelper");
const { notifyShipperOnAssignment } = require("./assignmentCreate.service");

/**
 * replaceAssignment
 * ─────────────────
 * Atomic "swap the driver on this job" — the answer to *the driver accepted but
 * can no longer finish it*. One transaction does BOTH halves so the slot can
 * never be observed empty and never keeps the old driver:
 *
 *  1. Lock + load the current assignment (404 when it is gone/soft-deleted).
 *  2. Company fence: caller must belong to the bid's company (403 otherwise).
 *  3. Refuse to replace a row that is already terminal (409) and refuse a
 *     no-op replacement (same driver + same vehicle, 400).
 *  4. Validate the NEW driver/vehicle before anything is written:
 *     - truck exists, belongs to this company, and is `assignmentStatus='active'`
 *       (`assertAssignableVehicle` — D6)
 *     - driver/vehicle not engaged elsewhere (`assertDriverNotDoubleBooked`,
 *       ignoring the very slot being replaced so re-picking the same driver
 *       is not a false 409)
 *  5. `recallAssignment` — old row → `cancelled_by_company`, old driver released
 *     (DriverRequest/JourneyDecision/Journey), slot back to `acceptedByShipper`,
 *     old truck pulled from the pool, queue holder entry closed.
 *  6. Open the replacement on the SAME slot with `assignmentStatus='reassigned'`
 *     (D3) — new DriverRequest at `requested`, fresh JourneyDecision.
 *  7. Notify: old driver (recalled), new driver (assigned), shipper.
 *
 * Everything is inside the caller's transaction (`executeInTransaction` in the
 * controller): any failure rolls the recall back with it, so the job either
 * swaps cleanly or does not change at all.
 *
 * @param {Object} data
 * @param {string} data.assignmentUniqueId   - assignment being replaced
 * @param {string} data.vehicleUniqueId      - replacement truck (must be active)
 * @param {string} data.driverUserUniqueId   - replacement driver
 * @param {string} data.createdByUserUniqueId - dispatcher
 * @param {object} data.user                 - caller (userUniqueId + roleId)
 * @returns {Promise<Object>} previous + replacement assignment pointers
 */
exports.replaceAssignment = async (data) => {
  const {
    assignmentUniqueId,
    vehicleUniqueId,
    driverUserUniqueId,
    createdByUserUniqueId,
    user,
  } = data;

  // 1. Lock the row we are about to replace.
  const previous = await readAssignmentForUpdate(assignmentUniqueId);

  // 2. Cross-company fence (platform admins pass through inside assertCompanyAccess).
  await assertRecallAccess(user, previous);

  // 3. A finished assignment cannot be replaced, and replacing it with itself
  //    is a client bug rather than something to silently no-op.
  if (!isActiveAssignment(previous.assignmentStatus)) {
    throw new AppError(
      `Assignment is already ${previous.assignmentStatus} and cannot be replaced`,
      AppError.CONFLICT,
    );
  }

  if (
    previous.driverUserUniqueId === driverUserUniqueId &&
    previous.vehicleUniqueId === vehicleUniqueId
  ) {
    throw new AppError(
      "Replacement driver and vehicle are identical to the current assignment",
      AppError.BAD_REQUEST,
    );
  }

  // The bid must still be the live, accepted one.
  const [[bid]] = await db().query(
    `SELECT companyBidRequestUniqueId, bidStatus, shipperRequestBatchUniqueId,
            companyUniqueId
       FROM CompanyBidRequest
      WHERE companyBidRequestUniqueId = ?
      LIMIT 1`,
    [previous.companyBidRequestUniqueId],
  );
  if (!bid) throw new AppError("Bid not found", AppError.NOT_FOUND);
  if (bid.bidStatus !== "accepted_by_shipper") {
    throw new AppError(
      "Vehicles can only be assigned after the shipper accepts the bid",
      AppError.BAD_REQUEST,
    );
  }

  // 4. Validate the replacement BEFORE touching anything.
  await assertAssignableVehicle({
    companyUniqueId: bid.companyUniqueId,
    vehicleUniqueId,
  });

  await assertDriverNotDoubleBooked({
    executor: db(),
    driverUserUniqueId,
    vehicleUniqueId,
    // Re-picking the SAME driver for the SAME slot must not trip the fence on
    // the assignment we are about to close.
    ignoreShipperRequestUniqueId: previous.shipperRequestUniqueId,
    actorLabel: "another company assignment",
  });

  // 5. Recall the current driver (frees the slot, the driver and the truck).
  const { recalled } = await recallAssignment({
    assignment: previous,
    actorUserUniqueId: createdByUserUniqueId,
  });
  if (!recalled) {
    throw new AppError(
      "Assignment changed while the replacement was prepared, please retry",
      AppError.CONFLICT,
    );
  }

  // If the dispatcher kept the same truck (only the driver changed), recall
  // just pulled it from the pool — put it straight back so the replacement
  // does not start life on an `inactive` vehicle.
  if (vehicleUniqueId === previous.vehicleUniqueId) {
    await db().query(
      `UPDATE CompanyVehicle
          SET assignmentStatus = 'active'
        WHERE vehicleUniqueId = ?
          AND companyVehicleDeletedAt IS NULL`,
      [vehicleUniqueId],
    );
  }

  // 6. Open the replacement on the same slot.
  const sr = await getShipperRequestByUniqueId(
    previous.shipperRequestUniqueId,
    bid.shipperRequestBatchUniqueId,
  );

  const driverRequestUniqueId = await upsertDriverRequest({
    driverUserUniqueId,
    newStatusId: journeyStatusMap.requested,
    originLat: sr.originLatitude,
    originLng: sr.originLongitude,
    originPlace: sr.originPlace ?? "Reassigned",
    shipperRequestUniqueId: previous.shipperRequestUniqueId,
  });

  const journeyDecisionUniqueId = await createJourneyDecisionForAssignment(
    previous.shipperRequestUniqueId,
    driverRequestUniqueId,
    createdByUserUniqueId,
  );

  const replacementAssignmentUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyBidVehicleAssignment
      (assignmentUniqueId, companyBidRequestUniqueId, shipperRequestUniqueId,
       vehicleUniqueId, driverUserUniqueId, driverRequestUniqueId,
       assignmentStatus, journeyDecisionUniqueId, assignmentCreatedBy, assignmentCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'reassigned', ?, ?, ?)`,
    [
      replacementAssignmentUniqueId,
      bid.companyBidRequestUniqueId,
      previous.shipperRequestUniqueId,
      vehicleUniqueId,
      driverUserUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
      createdByUserUniqueId,
      currentDate(),
    ],
  );

  logger.info("Assignment replaced", {
    previousAssignmentUniqueId: previous.assignmentUniqueId,
    assignmentUniqueId: replacementAssignmentUniqueId,
    previousDriverUserUniqueId: previous.driverUserUniqueId,
    driverUserUniqueId,
    shipperRequestUniqueId: previous.shipperRequestUniqueId,
  });

  // 7. Notifications — fired last so a late validation failure cannot announce
  //    a replacement that never happened.
  notifyDriverOfRecall({
    driverUserUniqueId: previous.driverUserUniqueId,
    assignmentUniqueId: previous.assignmentUniqueId,
    shipperRequestUniqueId: previous.shipperRequestUniqueId,
    companyBidRequestUniqueId: bid.companyBidRequestUniqueId,
  });

  notifyAssignedDriver({
    driverUserUniqueId,
    assignmentUniqueId: replacementAssignmentUniqueId,
    driverRequestUniqueId,
    shipperRequestUniqueId: previous.shipperRequestUniqueId,
    companyBidRequestUniqueId: bid.companyBidRequestUniqueId,
  });

  notifyShipperOnAssignment({
    companyBidRequestUniqueId: bid.companyBidRequestUniqueId,
    shipperRequestBatchUniqueId: bid.shipperRequestBatchUniqueId,
    results: [
      {
        assignmentUniqueId: replacementAssignmentUniqueId,
        shipperRequestUniqueId: previous.shipperRequestUniqueId,
      },
    ],
  });

  return {
    message: "Assignment replaced",
    data: {
      previousAssignmentUniqueId: previous.assignmentUniqueId,
      assignmentUniqueId: replacementAssignmentUniqueId,
      assignmentStatus: "reassigned",
      shipperRequestUniqueId: previous.shipperRequestUniqueId,
      driverRequestUniqueId,
      journeyDecisionUniqueId,
    },
  };
};
