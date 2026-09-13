"use strict";

const { db } = require("../../CompanyHelper.service");

/**
 * ### Full assignment data — matches GET /api/company/assignments response shape.
 *
 * Queries the assignment with all joined fields so WS notification `data`
 * is identical to what the REST API returns.
 */

async function getFullAssignmentData(assignmentUniqueId) {
  const [[row]] = await db().query(
    `SELECT
       cba.assignmentUniqueId,
       cba.assignmentStatus,
       cba.companyBidRequestUniqueId,
       cba.driverUserUniqueId,
       cba.journeyDecisionUniqueId,
       u.fullName,
       u.phoneNumber,
       v.licensePlate,
       v.color,
       vt.vehicleTypeUniqueId,
       vt.vehicleTypeName,
       dr.driverRequestUniqueId   AS drUniqueId,
       dr.originLatitude,
       dr.originLongitude,
       dr.originPlace,
       dr.journeyStatusId,
       cba.vehicleUniqueId,
       sr.shipperRequestUniqueId,
       sr.shipperRequestId,
       sr.originLatitude          AS srOriginLatitude,
       sr.originLongitude         AS srOriginLongitude,
       sr.originPlace             AS srOriginPlace,
       sr.destinationLatitude,
       sr.destinationLongitude,
       sr.destinationPlace,
        sr.shippableItemName,
        sr.shippingCost,
        sr.vehicleTypeUniqueId     AS srVehicleTypeUniqueId,
        sr.requestMode,
        sr.journeyStatusId         AS srJourneyStatusId,
        srb.batchId                AS srBatchId,
        jd.decisionTime,
        jd.decisionBy,
        jd.journeyStatusId         AS jdJourneyStatusId,
        j.journeyStartedAt,
        j.journeyCompletedAt
      FROM CompanyBidVehicleAssignment cba
      LEFT JOIN Users u           ON cba.driverUserUniqueId     = u.userUniqueId
      LEFT JOIN Vehicle v         ON cba.vehicleUniqueId        = v.vehicleUniqueId
      LEFT JOIN VehicleTypes vt   ON v.vehicleTypeUniqueId      = vt.vehicleTypeUniqueId
      LEFT JOIN DriverRequest dr  ON cba.driverRequestUniqueId  = dr.driverRequestUniqueId
      LEFT JOIN ShipperRequest sr ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
      LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId    = sr.shipperRequestBatchUniqueId
      LEFT JOIN JourneyDecisions jd ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      LEFT JOIN Journey j         ON cba.journeyDecisionUniqueId = j.journeyDecisionUniqueId
      WHERE cba.assignmentUniqueId = ?
      LIMIT 1`,
    [assignmentUniqueId],
  );
  if (!row) return null;
  return {
    assignmentUniqueId: row.assignmentUniqueId,
    assignmentStatus: row.assignmentStatus,
    batchId: row.srBatchId,
    shipperRequest: {
      shipperRequestUniqueId: row.shipperRequestUniqueId,
      shipperRequestId: row.shipperRequestId,
      batchId: row.srBatchId,
      originLatitude: row.srOriginLatitude,
      originLongitude: row.srOriginLongitude,
      originPlace: row.srOriginPlace,
      destinationLatitude: row.destinationLatitude,
      destinationLongitude: row.destinationLongitude,
      destinationPlace: row.destinationPlace,
      shippableItemName: row.shippableItemName,
      shippingCost: row.shippingCost,
      vehicleTypeUniqueId: row.srVehicleTypeUniqueId,
      requestMode: row.requestMode,
      journeyStatusId: row.srJourneyStatusId,
    },
    driverRequests: [
      {
        driverRequestUniqueId: row.drUniqueId,
        vehicleUniqueId: row.vehicleUniqueId,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        userUniqueId: row.driverUserUniqueId,
        originLatitude: row.originLatitude,
        originLongitude: row.originLongitude,
        originPlace: row.originPlace,
        journeyStatusId: row.journeyStatusId,
        vehicleOfDriver: {
          licensePlate: row.licensePlate,
          vehicleTypeUniqueId: row.vehicleTypeUniqueId,
          vehicleTypeName: row.vehicleTypeName,
          color: row.color,
        },
      },
    ],
    decisions: [
      {
        journeyDecisionUniqueId: row.journeyDecisionUniqueId,
        journeyStatusId: row.jdJourneyStatusId,
        decisionTime: row.decisionTime,
        decisionBy: row.decisionBy,
      },
    ],
    journey:
      row.journeyStartedAt || row.journeyCompletedAt
        ? {
            journeyDecisionUniqueId: row.journeyDecisionUniqueId,
            journeyStartedAt: row.journeyStartedAt,
            journeyCompletedAt: row.journeyCompletedAt,
          }
        : {},
  };
}
/**
 * ### Batch fetch full assignment records — matches GET /api/company/assignments.
 *
 * Accepts an array of assignmentUniqueId values and returns all matched records
 * in a single query, keyed by assignmentUniqueId.
 */

async function getAssignmentsData(assignmentUniqueIds) {
  if (!assignmentUniqueIds || assignmentUniqueIds.length === 0) return {};
  const [rows] = await db().query(
    `SELECT
       cba.assignmentUniqueId,
       cba.assignmentStatus,
       cba.companyBidRequestUniqueId,
       cba.driverUserUniqueId,
       cba.journeyDecisionUniqueId,
       u.fullName,
       u.phoneNumber,
       v.licensePlate,
       v.color,
       vt.vehicleTypeUniqueId,
       vt.vehicleTypeName,
       dr.driverRequestUniqueId   AS drUniqueId,
       dr.originLatitude,
       cba.vehicleUniqueId,
       dr.originLongitude,
       dr.originPlace,
       dr.journeyStatusId,
       sr.shipperRequestUniqueId,
       sr.shipperRequestId,
       sr.originLatitude          AS srOriginLatitude,
       sr.originLongitude         AS srOriginLongitude,
       sr.originPlace             AS srOriginPlace,
       sr.destinationLatitude,
       sr.destinationLongitude,
       sr.destinationPlace,
        sr.shippableItemName,
        sr.shippingCost,
        sr.vehicleTypeUniqueId     AS srVehicleTypeUniqueId,
        sr.requestMode,
        sr.journeyStatusId         AS srJourneyStatusId,
        srb.batchId                AS srBatchId,
        jd.decisionTime,
        jd.decisionBy,
        jd.journeyStatusId         AS jdJourneyStatusId,
        j.journeyStartedAt,
        j.journeyCompletedAt
      FROM CompanyBidVehicleAssignment cba
      LEFT JOIN Users u           ON cba.driverUserUniqueId     = u.userUniqueId
      LEFT JOIN Vehicle v         ON cba.vehicleUniqueId        = v.vehicleUniqueId
      LEFT JOIN VehicleTypes vt   ON v.vehicleTypeUniqueId      = vt.vehicleTypeUniqueId
      LEFT JOIN DriverRequest dr  ON cba.driverRequestUniqueId  = dr.driverRequestUniqueId
      LEFT JOIN ShipperRequest sr ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
      LEFT JOIN ShipperRequestBatch srb ON srb.batchUniqueId    = sr.shipperRequestBatchUniqueId
      LEFT JOIN JourneyDecisions jd ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
      LEFT JOIN Journey j         ON cba.journeyDecisionUniqueId = j.journeyDecisionUniqueId
      WHERE cba.assignmentUniqueId IN (?)
        AND cba.assignmentDeletedAt IS NULL`,
    [assignmentUniqueIds],
  );
  const map = {};
  for (const row of rows) {
    map[row.assignmentUniqueId] = {
      assignmentUniqueId: row.assignmentUniqueId,
      assignmentStatus: row.assignmentStatus,
      batchId: row.srBatchId,
      shipperRequest: {
        shipperRequestUniqueId: row.shipperRequestUniqueId,
        shipperRequestId: row.shipperRequestId,
        batchId: row.srBatchId,
        originLatitude: row.srOriginLatitude,
        originLongitude: row.srOriginLongitude,
        originPlace: row.srOriginPlace,
        destinationLatitude: row.destinationLatitude,
        destinationLongitude: row.destinationLongitude,
        destinationPlace: row.destinationPlace,
        shippableItemName: row.shippableItemName,
        shippingCost: row.shippingCost,
        vehicleTypeUniqueId: row.srVehicleTypeUniqueId,
        requestMode: row.requestMode,
        journeyStatusId: row.srJourneyStatusId,
      },
      driverRequests: [
        {
          driverRequestUniqueId: row.drUniqueId,
          vehicleUniqueId: row.vehicleUniqueId,
          fullName: row.fullName,
          phoneNumber: row.phoneNumber,
          userUniqueId: row.driverUserUniqueId,
          originLatitude: row.originLatitude,
          originLongitude: row.originLongitude,
          originPlace: row.originPlace,
          journeyStatusId: row.journeyStatusId,
          vehicleOfDriver: {
            licensePlate: row.licensePlate,
            vehicleTypeUniqueId: row.vehicleTypeUniqueId,
            vehicleTypeName: row.vehicleTypeName,
            color: row.color,
          },
        },
      ],
      decisions: [
        {
          journeyDecisionUniqueId: row.journeyDecisionUniqueId,
          journeyStatusId: row.jdJourneyStatusId,
          decisionTime: row.decisionTime,
          decisionBy: row.decisionBy,
        },
      ],
      journey:
        row.journeyStartedAt || row.journeyCompletedAt
          ? {
              journeyDecisionUniqueId: row.journeyDecisionUniqueId,
              journeyStartedAt: row.journeyStartedAt,
              journeyCompletedAt: row.journeyCompletedAt,
            }
          : {},
    };
  }
  return map;
}

module.exports.getFullAssignmentData = getFullAssignmentData;
module.exports.getAssignmentsData = getAssignmentsData;
