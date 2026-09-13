"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../../../Utils/CurrentDate");
const AppError = require("../../../Utils/AppError");
const { db } = require("../../CompanyHelper.service");
const { journeyStatusMap } = require("../../../Utils/ListOfSeedData");
const logger = require("../../../Utils/logger");

/**
 * Creates a JourneyDecision record that formally links a ShipperRequest
 * to a DriverRequest at the moment of company assignment (status 2).
 *
 * This is the canonical join between the shipper's request and the assigned
 * driver's request. Without it, `handleExistingJourney` in the status-
 * verification service cannot resolve the shipper context and would
 * incorrectly reset the DriverRequest back to status 1.
 *
 * Called by: createAssignment, createBulkAssignments, autoAssignBatch.
 * At confirmation (confirmed_by_driver) the same row is updated to status 4.
 *
 * @param {string} shipperRequestUniqueId
 * @param {string} driverRequestUniqueId
 * @param {string} createdByUserUniqueId  — dispatcher / company admin
 * @returns {Promise<string>} journeyDecisionUniqueId
 */

async function createJourneyDecisionForAssignment(
  shipperRequestUniqueId,
  driverRequestUniqueId,
  createdByUserUniqueId,
) {
  // Resolve numeric PKs
  const [[prRow]] = await db().query(
    "SELECT shipperRequestId, shippingCost FROM ShipperRequest WHERE shipperRequestUniqueId = ? LIMIT 1",

    [shipperRequestUniqueId],
  );
  if (!prRow) {
    throw new AppError(
      "Shipper request not found while creating JourneyDecision",
      AppError.NOT_FOUND,
    );
  }

  const [[drRow]] = await db().query(
    "SELECT driverRequestId FROM DriverRequest WHERE driverRequestUniqueId = ? LIMIT 1",
    [driverRequestUniqueId],
  );
  if (!drRow) {
    throw new AppError(
      "Driver request not found while creating JourneyDecision",
      AppError.NOT_FOUND,
    );
  }

  // Idempotency: if a JD already exists for this driverRequestId, return it.
  // Option B creates a NEW DriverRequest (old one is soft-deleted), so the new
  // DR will never collide with the cancelled individual JD's old DR.
  const [[existing]] = await db().query(
    "SELECT journeyDecisionUniqueId FROM JourneyDecisions WHERE driverRequestId = ? LIMIT 1",
    [drRow.driverRequestId],
  );
  if (existing) {
    return existing.journeyDecisionUniqueId;
  }

  const journeyDecisionUniqueId = uuidv4();
  await db().query(
    `INSERT INTO JourneyDecisions
      (journeyDecisionUniqueId, shipperRequestId, driverRequestId,
       journeyStatusId, decisionTime, decisionBy,
       shippingCostByDriver, journeyDecisionCreatedBy, journeyDecisionCreatedAt)
     VALUES (?, ?, ?, ?, ?, 'company', ?, ?, ?)`,
    [
      journeyDecisionUniqueId,
      prRow.shipperRequestId,
      drRow.driverRequestId,
      journeyStatusMap.requested, // status 2 — company has requested this driver
      currentDate(),
      prRow.shippingCost || 0,
      createdByUserUniqueId,
      currentDate(),
    ],
  );

  logger.info("JourneyDecision created at assignment time", {
    journeyDecisionUniqueId,
    shipperRequestUniqueId,
    driverRequestUniqueId,
    journeyStatusId: journeyStatusMap.requested,
  });

  return journeyDecisionUniqueId;
}

module.exports.createJourneyDecisionForAssignment = createJourneyDecisionForAssignment;
