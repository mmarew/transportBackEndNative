"use strict";

const { paginate, paginatedQuery } = require("../../CompanyHelper.service");

exports.getAssignments = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["cba.assignmentDeletedAt IS NULL"];
  const params = [];

  if (filters.assignmentUniqueId) {
    clauses.push("cba.assignmentUniqueId = ?");
    params.push(filters.assignmentUniqueId);
  }
  if (filters.companyBidRequestUniqueId) {
    clauses.push("cba.companyBidRequestUniqueId = ?");
    params.push(filters.companyBidRequestUniqueId);
  }
  if (filters.shipperRequestUniqueId) {
    clauses.push("cba.shipperRequestUniqueId = ?");
    params.push(filters.shipperRequestUniqueId);
  }
  if (filters.vehicleUniqueId) {
    clauses.push("cba.vehicleUniqueId = ?");
    params.push(filters.vehicleUniqueId);
  }
  if (filters.driverUserUniqueId) {
    clauses.push("cba.driverUserUniqueId = ?");
    params.push(filters.driverUserUniqueId);
  }
  if (filters.driverRequestUniqueId) {
    clauses.push("cba.driverRequestUniqueId = ?");
    params.push(filters.driverRequestUniqueId);
  }
  if (filters.assignmentStatus) {
    clauses.push("cba.assignmentStatus = ?");
    params.push(filters.assignmentStatus);
  }
  if (filters.journeyDecisionUniqueId) {
    clauses.push("cba.journeyDecisionUniqueId = ?");
    params.push(filters.journeyDecisionUniqueId);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;

  const BASE_COLS = `
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
    jd.decisionTime,
    jd.decisionBy,
    jd.journeyStatusId         AS jdJourneyStatusId,
    j.journeyStartedAt,
    j.journeyCompletedAt
  `;

  const baseSql = `
    SELECT ${BASE_COLS}
    FROM CompanyBidVehicleAssignment cba
    LEFT JOIN Users u           ON cba.driverUserUniqueId     = u.userUniqueId
    LEFT JOIN Vehicle v         ON cba.vehicleUniqueId        = v.vehicleUniqueId
    LEFT JOIN VehicleTypes vt   ON v.vehicleTypeUniqueId      = vt.vehicleTypeUniqueId
    LEFT JOIN DriverRequest dr  ON cba.driverRequestUniqueId  = dr.driverRequestUniqueId
    LEFT JOIN ShipperRequest sr ON cba.shipperRequestUniqueId = sr.shipperRequestUniqueId
    LEFT JOIN JourneyDecisions jd ON cba.journeyDecisionUniqueId = jd.journeyDecisionUniqueId
    LEFT JOIN Journey j         ON cba.journeyDecisionUniqueId = j.journeyDecisionUniqueId
    ${where}
  `;

  const raw = await paginatedQuery(
    `${baseSql} ORDER BY cba.assignmentCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyBidVehicleAssignment cba ${where}`,
    params,
    page,
    limit,
    offset,
  );

  raw.data = raw.data.map((r) => ({
    assignmentUniqueId: r.assignmentUniqueId,
    assignmentStatus: r.assignmentStatus,
    shipperRequest: {
      shipperRequestUniqueId: r.shipperRequestUniqueId,
      shipperRequestId: r.shipperRequestId,
      originLatitude: r.srOriginLatitude,
      originLongitude: r.srOriginLongitude,
      originPlace: r.srOriginPlace,
      destinationLatitude: r.destinationLatitude,
      destinationLongitude: r.destinationLongitude,
      destinationPlace: r.destinationPlace,
      shippableItemName: r.shippableItemName,
      shippingCost: r.shippingCost,
      vehicleTypeUniqueId: r.srVehicleTypeUniqueId,
      requestMode: r.requestMode,
      journeyStatusId: r.srJourneyStatusId,
    },
    driverRequests: [
      {
        driverRequestUniqueId: r.drUniqueId,
        vehicleUniqueId: r.vehicleUniqueId,
        fullName: r.fullName,
        phoneNumber: r.phoneNumber,
        userUniqueId: r.driverUserUniqueId,
        originLatitude: r.originLatitude,
        originLongitude: r.originLongitude,
        originPlace: r.originPlace,
        journeyStatusId: r.journeyStatusId,
        vehicleOfDriver: {
          licensePlate: r.licensePlate,
          vehicleTypeUniqueId: r.vehicleTypeUniqueId,
          vehicleTypeName: r.vehicleTypeName,
          color: r.color,
        },
      },
    ],
    decisions: [
      {
        journeyDecisionUniqueId: r.journeyDecisionUniqueId,
        journeyStatusId: r.jdJourneyStatusId,
        decisionTime: r.decisionTime,
        decisionBy: r.decisionBy,
      },
    ],
    journey:
      r.journeyStartedAt || r.journeyCompletedAt
        ? {
            journeyDecisionUniqueId: r.journeyDecisionUniqueId,
            journeyStartedAt: r.journeyStartedAt,
            journeyCompletedAt: r.journeyCompletedAt,
          }
        : {},
  }));

  return raw;
};
