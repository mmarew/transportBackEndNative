"use strict";

const { pool } = require("../Middleware/Database.config");
const { usersRoles } = require("../Utils/ListOfSeedData");

exports.getOrganizationCounts = async () => {
  const exec = pool;

  const [
    [orgStatsRow],
    [companyStatsRow],
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
      `SELECT approvalStatus, COUNT(*) AS c
       FROM TransportCompany
       WHERE isDeleted = 0
       GROUP BY approvalStatus`,
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
  const companyByStatus = { pending: 0, approved: 0, rejected: 0, suspended: 0 };
  let totalCompanies = 0;
  for (const row of companyStatsRow || []) {
    totalCompanies += n(row.c);
    if (Object.prototype.hasOwnProperty.call(companyByStatus, row.approvalStatus)) {
      companyByStatus[row.approvalStatus] += n(row.c);
    }
  }

  return {
    message: "Dashboard stats fetched successfully",
    data: {
      queueOrganizations: {
        total: n(orgStatsRow?.[0]?.total),
        pending: n(orgStatsRow?.[0]?.pending),
        approved: n(orgStatsRow?.[0]?.approved),
        rejected: n(orgStatsRow?.[0]?.rejected),
        suspended: n(orgStatsRow?.[0]?.suspended),
      },
      transportCompanies: {
        numberOfCompanies: {
          totalCompanies,
          pendingCompanies: companyByStatus.pending,
          approvedCompanies: companyByStatus.approved,
          suspendedCompanies: companyByStatus.suspended,
          rejectedCompanies: companyByStatus.rejected,
        },
        totalCompanyVehicles: n(vehicleRow[0]?.total),
        totalCompanyDrivers: n(driverRow[0]?.total),
        activeCompanyBids: n(bidRow[0]?.total),
        averageRating,
      },
    },
  };
};