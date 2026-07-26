"use strict";

const { pool } = require("../Middleware/Database.config");
const { usersRoles } = require("../Utils/ListOfSeedData");

exports.getDashboardStats = async () => {
  const exec = pool;

  const [
    [pendingRow],
    [approvedRow],
    [suspendedRow],
    [vehicleRow],
    [driverRow],
    [bidRow],
    [ratingRow],
  ] = await Promise.all([
    exec.query(
      `SELECT COUNT(*) AS total FROM TransportCompany
       WHERE approvalStatus = 'pending' AND isDeleted = 0`,
    ),
    exec.query(
      `SELECT COUNT(*) AS total FROM TransportCompany
       WHERE approvalStatus = 'approved' AND isDeleted = 0`,
    ),
    exec.query(
      `SELECT COUNT(*) AS total FROM TransportCompany
       WHERE approvalStatus = 'suspended' AND isDeleted = 0`,
    ),
    exec.query(
      `SELECT COUNT(*) AS total FROM CompanyVehicle
       WHERE assignmentStatus = 'active' AND companyVehicleDeletedAt IS NULL`,
    ),
    exec.query(
      `SELECT COUNT(DISTINCT cm.userUniqueId) AS total
       FROM CompanyMembership cm
       JOIN UserRole ur ON cm.userUniqueId = ur.userUniqueId
        AND ur.roleId = ? AND ur.userRoleDeletedAt IS NULL
       WHERE cm.isActive = 1 AND cm.membershipDeletedAt IS NULL`,
      [usersRoles.driverRoleId],
    ),
    exec.query(
      `SELECT COUNT(*) AS total FROM CompanyBidRequest
       WHERE bidStatus = 'submitted' AND companyBidRequestDeletedAt IS NULL`,
    ),
    exec.query(
      `SELECT AVG(rating) AS averageRating, COUNT(*) AS totalRatings
       FROM CompanyRating WHERE companyRatingDeletedAt IS NULL`,
    ),
  ]);

  const averageRating = ratingRow[0]?.averageRating
    ? Number(Number(ratingRow[0].averageRating).toFixed(1))
    : null;

  return {
    message: "Dashboard stats fetched successfully",
    data: {
      pendingCompanies: Number(pendingRow[0]?.total || 0),
      approvedCompanies: Number(approvedRow[0]?.total || 0),
      suspendedCompanies: Number(suspendedRow[0]?.total || 0),
      totalCompanyVehicles: Number(vehicleRow[0]?.total || 0),
      totalCompanyDrivers: Number(driverRow[0]?.total || 0),
      activeCompanyBids: Number(bidRow[0]?.total || 0),
      averageRating,
    },
  };
};
