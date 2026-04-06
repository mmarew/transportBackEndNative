"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { usersRoles } = require("../Utils/ListOfSeedData");
const {
  db,
  findOne,
  paginate,
  paginatedQuery,
} = require("./CompanyHelper.service");
const { addMember } = require("./CompanyMembership.service");

exports.createCompany = async (data) => {
  const {
    companyName,
    companyRegistrationNumber,
    companyPhone,
    companyEmail,
    companyAddress,
    companyLogoUrl,
    createdByUserUniqueId,
  } = data;

  // Duplicate check for critical fields
  const dupCheckFields = {
    companyName: "name",
    companyRegistrationNumber: "registration number",
    companyPhone: "phone number",
    companyEmail: "email address",
  };

  const checks = [];
  const checkParams = [];

  for (const field in dupCheckFields) {
    if (data[field]) {
      checks.push(`${field} = ?`);
      checkParams.push(data[field]);
    }
  }

  if (checks.length > 0) {
    const [existing] = await db().query(
      `SELECT companyName, companyRegistrationNumber, companyPhone, companyEmail 
       FROM TransportCompany 
       WHERE (${checks.join(" OR ")}) AND isDeleted = 0`,
      checkParams,
    );

    if (existing.length > 0) {
      for (const field in dupCheckFields) {
        if (data[field] && existing.some((e) => e[field] === data[field])) {
          throw new AppError(
            `A company with this ${dupCheckFields[field]} already exists`,
            409,
          );
        }
      }
    }
  }

  const companyUniqueId = uuidv4();
  await db().query(
    `INSERT INTO TransportCompany
      (companyUniqueId, companyName, companyRegistrationNumber, companyPhone,
       companyEmail, companyAddress, companyLogoUrl, approvalStatus,
       companyCreatedBy, companyCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      companyUniqueId,
      companyName,
      companyRegistrationNumber || null,
      companyPhone || null,
      companyEmail || null,
      companyAddress || null,
      companyLogoUrl || null,
      createdByUserUniqueId,
      currentDate(),
    ],
  );

  // Auto-link creator as owner if they are not system admins (3 or 6)
  const user = data.user;
  if (
    user &&
    user.roleId !== usersRoles.adminRoleId &&
    user.roleId !== usersRoles.supperAdminRoleId
  ) {
    await addMember({
      companyUniqueId,
      userUniqueId: user.userUniqueId,
      membershipRole: "owner",
      membershipStartDate: currentDate(),
      createdByUserUniqueId: createdByUserUniqueId,
      skipApprovalCheck: true,
    });
  }

  return { message: "success", data: { companyUniqueId } };
};

exports.getCompanies = async (filters = {}, user = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["TransportCompany.isDeleted = 0"];
  const params = [];

  // Data Segregation: Non-admins only see companies they belong to
  if (
    user.roleId !== usersRoles.adminRoleId &&
    user.roleId !== usersRoles.supperAdminRoleId
  ) {
    clauses.push(
      `TransportCompany.companyUniqueId IN (
        SELECT companyUniqueId FROM CompanyMembership 
        WHERE userUniqueId = ? AND membershipDeletedAt IS NULL
      )`,
    );
    params.push(user.userUniqueId);
  }

  if (filters.companyUniqueId) {
    clauses.push("TransportCompany.companyUniqueId = ?");
    params.push(filters.companyUniqueId);
  }
  if (filters.companyName) {
    clauses.push("TransportCompany.companyName LIKE ?");
    params.push(`%${filters.companyName}%`);
  }
  if (filters.approvalStatus) {
    clauses.push("TransportCompany.approvalStatus = ?");
    params.push(filters.approvalStatus);
  }
  if (filters.isDeleted !== undefined) {
    clauses[0] = `TransportCompany.isDeleted = ${filters.isDeleted ? 1 : 0}`;
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM TransportCompany ${where} ORDER BY TransportCompany.companyCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM TransportCompany ${where}`,
    params,
    page,
    limit,
    offset,
  );
};
// update company

exports.updateCompany = async (companyUniqueId, data, updatedBy) => {
  const allowed = [
    "companyName",
    "companyRegistrationNumber",
    "companyPhone",
    "companyEmail",
    "companyAddress",
    "companyLogoUrl",
  ];
  // Duplicate check for critical fields
  const dupCheckFields = {
    companyName: "name",
    companyRegistrationNumber: "registration number",
    companyPhone: "phone number",
    companyEmail: "email address",
  };

  const checks = [];
  const checkParams = [];

  for (const field in dupCheckFields) {
    if (data[field]) {
      checks.push(`${field} = ?`);
      checkParams.push(data[field]);
    }
  }

  if (checks.length > 0) {
    const [existing] = await db().query(
      `SELECT companyName, companyRegistrationNumber, companyPhone, companyEmail 
       FROM TransportCompany 
       WHERE (${checks.join(" OR ")}) AND companyUniqueId != ? AND isDeleted = 0`,
      [...checkParams, companyUniqueId],
    );

    if (existing.length > 0) {
      for (const field in dupCheckFields) {
        if (data[field] && existing.some((e) => e[field] === data[field])) {
          throw new AppError(
            `A company with this ${dupCheckFields[field]} already exists`,
            409,
          );
        }
      }
    }
  }

  const setParts = [];
  const vals = [];

  for (const k of allowed) {
    if (data[k] !== undefined) {
      setParts.push(`${k} = ?`);
      vals.push(data[k]);
    }
  }
  if (setParts.length === 0) {throw new AppError("No fields to update", 400);}
  setParts.push("companyUpdatedBy = ?", "companyUpdatedAt = ?");
  vals.push(updatedBy, currentDate(), companyUniqueId);

  const [res] = await db().query(
    `UPDATE TransportCompany SET ${setParts.join(", ")} WHERE companyUniqueId = ? AND isDeleted = 0`,
    vals,
  );
  if (res.affectedRows === 0) {throw new AppError("Company not found", 404);}
  return { message: "success", data: "Company updated" };
};

exports.approveCompany = async (
  companyUniqueId,
  approvalStatus,
  approvalReason,
  approvedBy,
) => {
  await findOne(
    "TransportCompany",
    { companyUniqueId, isDeleted: 0 },
    "Company not found",
  );
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET approvalStatus = ?, approvalReason = ?, approvedBy = ?, approvedAt = ?,
         companyUpdatedBy = ?, companyUpdatedAt = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [
      approvalStatus,
      approvalReason || null,
      approvedBy,
      currentDate(),
      approvedBy,
      currentDate(),
      companyUniqueId,
    ],
  );
  if (res.affectedRows === 0) {throw new AppError("Company not found", 404);}
  return { message: "success", data: `Company ${approvalStatus}` };
};

exports.deleteCompany = async (companyUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET isDeleted = 1, companyDeletedAt = ?, companyDeletedBy = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [currentDate(), deletedBy, companyUniqueId],
  );
  if (res.affectedRows === 0)
  {throw new AppError("Company not found or already deleted", 404);}
  return { message: "success", data: "Company deleted" };
};
