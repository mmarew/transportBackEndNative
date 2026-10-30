"use strict";

const { db, assertCompanyAccess } = require("../CompanyHelper.service");
const AppError = require("../../Utils/AppError");
const { usersRoles } = require("../../Utils/ListOfSeedData");
const { ACTIVE_JOURNEY_STATUSES } = require("../DriverQueue/helpers");

const getAssignmentAvailability = async ({ companyUniqueId, vehicleTypeUniqueId, user }) => {
  if (!companyUniqueId) {
    throw new AppError("companyUniqueId is required", AppError.BAD_REQUEST);
  }

  await assertCompanyAccess({ companyUniqueId, user });

  const filters = [companyUniqueId];
  let vehicleTypeFilter = "";
  if (vehicleTypeUniqueId) {
    vehicleTypeFilter = "AND v.vehicleTypeUniqueId = ?";
    filters.push(vehicleTypeUniqueId);
  }

  const [rows] = await db().query(
    `SELECT 
       cv.companyVehicleUniqueId,
       cv.vehicleUniqueId,
       cv.assignmentStatus AS companyVehicleAssignmentStatus,
       v.plateNumber,
       v.vehicleTypeUniqueId,
       vd.driverUserUniqueId,
       u.fullName,
       u.phoneNumber,
       u.email,
       ur.userRoleId,
       ursc.statusId,
       s.statusName,
       s.statusDescription,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM CompanyBidVehicleAssignment cba
           WHERE (cba.driverUserUniqueId = vd.driverUserUniqueId OR cba.vehicleUniqueId = cv.vehicleUniqueId)
             AND cba.assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
             AND cba.assignmentDeletedAt IS NULL
         )
         OR EXISTS (
           SELECT 1 FROM JourneyDecisions jd
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE dr.userUniqueId = vd.driverUserUniqueId
             AND dr.driverRequestDeletedAt IS NULL
             AND jd.journeyStatusId IN (${ACTIVE_JOURNEY_STATUSES.join(", ")})
         )
         OR EXISTS (
           SELECT 1 FROM CompanyBidVehicleAssignment cba2
           JOIN JourneyDecisions jd2 ON jd2.journeyDecisionUniqueId = cba2.journeyDecisionUniqueId
           WHERE cba2.vehicleUniqueId = cv.vehicleUniqueId
             AND cba2.assignmentDeletedAt IS NULL
             AND jd2.journeyDecisionDeletedAt IS NULL
             AND jd2.journeyStatusId IN (${ACTIVE_JOURNEY_STATUSES.join(", ")})
         ) THEN 'reserved'
         WHEN ursc.statusId = 1 THEN 'free'
         ELSE 'notAssignable'
       END AS availability,
       CASE
         WHEN EXISTS (
           SELECT 1 FROM CompanyBidVehicleAssignment cba
           WHERE (cba.driverUserUniqueId = vd.driverUserUniqueId OR cba.vehicleUniqueId = cv.vehicleUniqueId)
             AND cba.assignmentStatus NOT IN ('completed', 'cancelled_by_company', 'cancelled_by_shipper', 'cancelled_by_driver', 'rejected_by_driver')
             AND cba.assignmentDeletedAt IS NULL
         ) THEN 'on_active_assignment'
         WHEN EXISTS (
           SELECT 1 FROM JourneyDecisions jd
           JOIN DriverRequest dr ON dr.driverRequestId = jd.driverRequestId
           WHERE dr.userUniqueId = vd.driverUserUniqueId
             AND dr.driverRequestDeletedAt IS NULL
             AND jd.journeyStatusId IN (${ACTIVE_JOURNEY_STATUSES.join(", ")})
         ) OR EXISTS (
           SELECT 1 FROM CompanyBidVehicleAssignment cba2
           JOIN JourneyDecisions jd2 ON jd2.journeyDecisionUniqueId = cba2.journeyDecisionUniqueId
           WHERE cba2.vehicleUniqueId = cv.vehicleUniqueId
             AND cba2.assignmentDeletedAt IS NULL
             AND jd2.journeyDecisionDeletedAt IS NULL
             AND jd2.journeyStatusId IN (${ACTIVE_JOURNEY_STATUSES.join(", ")})
         ) THEN 'on_active_journey'
         WHEN ursc.statusId = 1 THEN NULL
         ELSE 'role_status_not_on_duty'
       END AS reason
     FROM CompanyVehicle cv
     JOIN Vehicle v ON cv.vehicleUniqueId = v.vehicleUniqueId
     JOIN VehicleDriver vd ON cv.vehicleUniqueId = vd.vehicleUniqueId
     JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     JOIN UserRole ur ON ur.userUniqueId = vd.driverUserUniqueId AND ur.roleId = ${usersRoles.driverRoleId} AND ur.userRoleDeletedAt IS NULL
     LEFT JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
     LEFT JOIN Statuses s ON s.statusId = ursc.statusId
     WHERE cv.companyUniqueId = ?
       AND cv.assignmentStatus = 'active'
       AND cv.companyVehicleDeletedAt IS NULL
       AND vd.assignmentStatus = 'active'
       AND u.isDeleted IS NULL
       AND u.userDeletedAt IS NULL
       ${vehicleTypeFilter}
     ORDER BY availability, u.fullName`,
    filters,
  );

  const result = {
    free: [],
    reserved: [],
    notAssignable: [],
  };

  for (const row of rows) {
    if (row.availability === "free") {
      result.free.push({
        driverUserUniqueId: row.driverUserUniqueId,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        email: row.email,
        vehicleUniqueId: row.vehicleUniqueId,
        plateNumber: row.plateNumber,
        vehicleTypeUniqueId: row.vehicleTypeUniqueId,
        companyVehicleUniqueId: row.companyVehicleUniqueId,
        statusId: row.statusId,
        statusName: row.statusName,
      });
    } else if (row.availability === "reserved") {
      result.reserved.push({
        driverUserUniqueId: row.driverUserUniqueId,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        email: row.email,
        vehicleUniqueId: row.vehicleUniqueId,
        plateNumber: row.plateNumber,
        vehicleTypeUniqueId: row.vehicleTypeUniqueId,
        companyVehicleUniqueId: row.companyVehicleUniqueId,
        statusId: row.statusId,
        statusName: row.statusName,
        reason: row.reason,
      });
    } else {
      result.notAssignable.push({
        driverUserUniqueId: row.driverUserUniqueId,
        fullName: row.fullName,
        phoneNumber: row.phoneNumber,
        email: row.email,
        vehicleUniqueId: row.vehicleUniqueId,
        plateNumber: row.plateNumber,
        vehicleTypeUniqueId: row.vehicleTypeUniqueId,
        companyVehicleUniqueId: row.companyVehicleUniqueId,
        statusId: row.statusId,
        statusName: row.statusName,
        reason: row.reason || "role_status_not_on_duty",
      });
    }
  }

  return {
    message: "success",
    data: {
      companyUniqueId,
      counts: {
        free: result.free.length,
        reserved: result.reserved.length,
        notAssignable: result.notAssignable.length,
        total: rows.length,
      },
      ...result,
    },
  };
};

module.exports = { getAssignmentAvailability };
