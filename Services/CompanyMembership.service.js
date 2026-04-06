"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db, findOne, paginate, paginatedQuery } = require("./CompanyHelper.service");

exports.addMember = async (data) => {
  const {
    companyUniqueId,
    userUniqueId,
    membershipRole,
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

  // Duplicate membership check
  const [dup] = await db().query(
    "SELECT membershipId FROM CompanyMembership WHERE companyUniqueId = ? AND userUniqueId = ? AND membershipDeletedAt IS NULL",
    [companyUniqueId, userUniqueId],
  );
  if (dup.length > 0) throw new AppError("User is already a member of this company", 409);

  const membershipUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyMembership
      (membershipUniqueId, companyUniqueId, userUniqueId, membershipRole,
       isActive, membershipStartDate, membershipEndDate,
       membershipCreatedBy, membershipCreatedAt)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    [membershipUniqueId, companyUniqueId, userUniqueId, membershipRole,
      membershipStartDate, membershipEndDate || null,
      createdByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { membershipUniqueId } };
};

exports.getMembers = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["membershipDeletedAt IS NULL"];
  const params = [];

  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.userUniqueId) { clauses.push("userUniqueId = ?"); params.push(filters.userUniqueId); }
  if (filters.membershipRole) { clauses.push("membershipRole = ?"); params.push(filters.membershipRole); }
  if (filters.isActive !== undefined) { clauses.push("isActive = ?"); params.push(filters.isActive ? 1 : 0); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyMembership ${where} ORDER BY membershipCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyMembership ${where}`,
    params, page, limit, offset,
  );
};

exports.deactivateMember = async (membershipUniqueId, updatedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyMembership
     SET isActive = 0, membershipEndDate = ?, membershipUpdatedBy = ?, membershipUpdatedAt = ?
     WHERE membershipUniqueId = ? AND membershipDeletedAt IS NULL`,
    [currentDate(), updatedBy, currentDate(), membershipUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Membership not found", 404);
  return { message: "success", data: "Membership deactivated" };
};

exports.deleteMember = async (membershipUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyMembership
     SET membershipDeletedAt = ?, membershipDeletedBy = ?
     WHERE membershipUniqueId = ? AND membershipDeletedAt IS NULL`,
    [currentDate(), deletedBy, membershipUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Membership not found or already deleted", 404);
  return { message: "success", data: "Membership deleted" };
};
