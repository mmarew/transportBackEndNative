"use strict";

const { pool } = require("../Middleware/Database.config");
const { usersRoles } = require("../Utils/ListOfSeedData");

exports.getDashboardStats = async () => {
  const exec = pool;

  const [
    [orgStatsRow],
    [pendingCompanyRow],
    [approvedCompanyRow],
    [suspendedCompanyRow],
    [vehicleRow],
    [driverRow],
    [bidRow],
    [ratingRow],
  ] = await Promise.all([
    exec.query(
      `SELECT
         SUM(qo.approvalStatus = 'pending')   AS pending,
         SUM(qo.approvalStatus = 'approved')  AS approved,
         SUM(qo.approvalStatus = 'rejected')  AS rejected,
         SUM(qo.approvalStatus = 'suspended') AS suspended,
         COUNT(*)                             AS total
       FROM QueueOrganization qo
       WHERE qo.isDeleted = 0`,
    ),
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
  const n = (v) => Number(v || 0);

  return {
    message: "Dashboard stats fetched successfully",
    data: {
      organizations: {
        total: n(orgStatsRow?.[0]?.total),
        pending: n(orgStatsRow?.[0]?.pending),
        approved: n(orgStatsRow?.[0]?.approved),
        rejected: n(orgStatsRow?.[0]?.rejected),
        suspended: n(orgStatsRow?.[0]?.suspended),
      },
      pendingCompanies: n(pendingCompanyRow[0]?.total),
      approvedCompanies: n(approvedCompanyRow[0]?.total),
      suspendedCompanies: n(suspendedCompanyRow[0]?.total),
      totalCompanyVehicles: n(vehicleRow[0]?.total),
      totalCompanyDrivers: n(driverRow[0]?.total),
      activeCompanyBids: n(bidRow[0]?.total),
      averageRating,
    },
  };
};