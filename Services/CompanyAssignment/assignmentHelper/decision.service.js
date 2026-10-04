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

  // Idempotency: if a JD already exists for this driverRequestId AND this
  // ShipperRequest, return it. The ShipperRequest scoping is load-bearing —
  // matching on driverRequestId alone returns a decision belonging to some
  // other order the driver is holding, and the caller then mutates THAT row
  // (promoting its status, stamping it on this assignment) while leaving this
  // order with no decision at all.
  const [[existing]] = await db().query(
    `SELECT journeyDecisionUniqueId
       FROM JourneyDecisions
      WHERE driverRequestId = ?
        AND shipperRequestId = ?
        AND journeyDecisionDeletedAt IS NULL
      ORDER BY journeyDecisionId DESC
      LIMIT 1`,
    [drRow.driverRequestId, prRow.shipperRequestId],
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
