"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");
const { usersRoles } = require("../Utils/ListOfSeedData");

/**
 * Adds a new member to a company with a specific role ID.
 *
 * @param {Object} data - Membership data
 * @param {string} data.companyUniqueId - ID of the company
 * @param {string} data.userUniqueId - ID of the user (or "self")
 * @param {string} data.companyRoleUniqueId - Valid UUID of the company role
 * @param {string} data.membershipStartDate - ISO date
 * @param {string} [data.membershipEndDate] - Optional ISO date
 * @param {string} data.createdByUserUniqueId - ID of the creator
 * @param {boolean} [data.skipApprovalCheck=false] - For system auto-linking
 * @returns {Promise<Object>} Success message and new membershipUniqueId
 */
exports.addMember = async (data) => {
  const {
    companyUniqueId,
    userUniqueId,
    companyRoleUniqueId,
    membershipStartDate,
    membershipEndDate,
    createdByUserUniqueId,
    skipApprovalCheck = false,
  } = data;

  // Verify company exists
  const company = await findOne(
    "TransportCompany",
    { companyUniqueId, isDeleted: 0 },
    "Company not found",
  );

  // Status check (unless skipped for initial creation)
  if (!skipApprovalCheck && company.approvalStatus !== "approved") {
    throw new AppError("Company is not approved yet", 400);
  }

  const [existing] = await db().query(
    "SELECT membershipUniqueId, membershipDeletedAt FROM CompanyMembership WHERE companyUniqueId = ? AND userUniqueId = ?",
    [companyUniqueId, userUniqueId],
  );
  if (existing.length > 0) {
    return { message: "success", data: { membershipUniqueId: existing[0].membershipUniqueId } };
  }

  const membershipUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyMembership
      (membershipUniqueId, companyUniqueId, userUniqueId, companyRoleUniqueId,
       isActive, membershipStartDate, membershipEndDate,
       membershipCreatedBy, membershipCreatedAt)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [
      membershipUniqueId,
      companyUniqueId,
      userUniqueId,
      companyRoleUniqueId, // This is now a UUID from the schema
      membershipStartDate,
      membershipEndDate || null,
      createdByUserUniqueId,
      currentDate(),
    ],
  );
  return { message: "success", data: { membershipUniqueId } };
};

/**
   * Retrieves a list of company members with roles and user profile details.
   * Performs JOINs with CompanyRoles and Users tables.
   *
   * @param {Object} [filters={}] - Query filters (userUniqueId, companyUniqueId, roleID, etc.)
   * @param {Object} [user={}] - Authenticated user object for data segregation
   * @returns {Promise<Object>} Paginated list of members with fullName, role name, etc.
   */
exports.getMembers = async (filters = {}, user = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["cm.membershipDeletedAt IS NULL"];
  const params = [];

  // Data Segregation: Non-admins only see members of companies they belong to
  if (
    user.roleId !== usersRoles.adminRoleId &&
      user.roleId !== usersRoles.supperAdminRoleId
  ) {
    clauses.push(
      `cm.companyUniqueId IN (
        SELECT companyUniqueId FROM CompanyMembership 
        WHERE userUniqueId = ? AND membershipDeletedAt IS NULL
      )`,
    );
    params.push(user.userUniqueId);
  }

  if (filters.companyUniqueId) {
    clauses.push("cm.companyUniqueId = ?");
    params.push(filters.companyUniqueId);
  }
  if (filters.userUniqueId) {
    clauses.push("cm.userUniqueId = ?");
    params.push(filters.userUniqueId);
  }
  if (filters.membershipRole) {
    clauses.push("cm.companyRoleUniqueId = ?");
    params.push(filters.membershipRole);
  }
  if (filters.isActive !== undefined) {
    clauses.push("cm.isActive = ?");
    params.push(filters.isActive ? 1 : 0);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT cm.*, 
            cr.companyRoleName, cr.companyRoleDescription,
            u.fullName, u.phoneNumber, u.email
     FROM CompanyMembership cm
     JOIN CompanyRoles cr ON cm.companyRoleUniqueId = cr.companyRoleUniqueId
     JOIN Users u ON cm.userUniqueId = u.userUniqueId
     ${where} 
     ORDER BY cm.membershipCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyMembership cm ${where}`,
    params,
    page,
    limit,
    offset,
  );
};

exports.deactivateMember = async (membershipUniqueId, updatedBy) => {
  const [existing] = await db().query(
    "SELECT membershipUniqueId FROM CompanyMembership WHERE membershipUniqueId = ?",
    [membershipUniqueId],
  );
  if (existing.length === 0) {throw new AppError("Membership not found", 404);}

  await db().query(
    `UPDATE CompanyMembership
     SET isActive = 0, membershipEndDate = ?, membershipUpdatedBy = ?, membershipUpdatedAt = ?
     WHERE membershipUniqueId = ?`,
    [currentDate(), updatedBy, currentDate(), membershipUniqueId],
  );
  return { message: "success", data: "Membership deactivated" };
};

exports.deleteMember = async (membershipUniqueId, deletedBy) => {
  const [existing] = await db().query(
    "SELECT membershipUniqueId FROM CompanyMembership WHERE membershipUniqueId = ?",
    [membershipUniqueId],
  );
  if (existing.length === 0) {throw new AppError("Membership not found", 404);}

  await db().query(
    `UPDATE CompanyMembership
     SET membershipDeletedAt = ?, membershipDeletedBy = ?
     WHERE membershipUniqueId = ?`,
    [currentDate(), deletedBy, membershipUniqueId],
  );
  return { message: "success", data: "Membership deleted" };
};
