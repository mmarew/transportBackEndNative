"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db, findOne, paginate, paginatedQuery } = require("./CompanyHelper.service");

exports.createCompany = async (data) => {
  const { companyName, companyRegistrationNumber, companyPhone, companyEmail,
    companyAddress, companyLogoUrl, createdByUserUniqueId } = data;

  // Duplicate check on name
  const [dup] = await db().query(
    "SELECT companyId FROM TransportCompany WHERE companyName = ? AND isDeleted = 0",
    [companyName],
  );
  if (dup.length > 0) throw new AppError("A company with this name already exists", 409);

  const companyUniqueId = uuidv4();
  await db().query(
    `INSERT INTO TransportCompany
      (companyUniqueId, companyName, companyRegistrationNumber, companyPhone,
       companyEmail, companyAddress, companyLogoUrl, approvalStatus,
       companyCreatedBy, companyCreatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [companyUniqueId, companyName, companyRegistrationNumber || null,
      companyPhone || null, companyEmail || null,
      companyAddress || null, companyLogoUrl || null,
      createdByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { companyUniqueId } };
};

exports.getCompanies = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["isDeleted = 0"];
  const params = [];

  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.companyName) { clauses.push("companyName LIKE ?"); params.push(`%${filters.companyName}%`); }
  if (filters.approvalStatus) { clauses.push("approvalStatus = ?"); params.push(filters.approvalStatus); }
  if (filters.isDeleted !== undefined) {
    clauses[0] = `isDeleted = ${filters.isDeleted ? 1 : 0}`;
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM TransportCompany ${where} ORDER BY companyCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM TransportCompany ${where}`,
    params, page, limit, offset,
  );
};

exports.updateCompany = async (companyUniqueId, data, updatedBy) => {
  const allowed = ["companyName", "companyRegistrationNumber", "companyPhone",
    "companyEmail", "companyAddress", "companyLogoUrl"];
  const setParts = [];
  const vals = [];
  for (const k of allowed) {
    if (data[k] !== undefined) { setParts.push(`${k} = ?`); vals.push(data[k]); }
  }
  if (setParts.length === 0) throw new AppError("No fields to update", 400);
  setParts.push("companyUpdatedBy = ?", "companyUpdatedAt = ?");
  vals.push(updatedBy, currentDate(), companyUniqueId);

  const [res] = await db().query(
    `UPDATE TransportCompany SET ${setParts.join(", ")} WHERE companyUniqueId = ? AND isDeleted = 0`,
    vals,
  );
  if (res.affectedRows === 0) throw new AppError("Company not found", 404);
  return { message: "success", data: "Company updated" };
};

exports.approveCompany = async (companyUniqueId, approvalStatus, approvalReason, approvedBy) => {
  await findOne("TransportCompany", { companyUniqueId, isDeleted: 0 }, "Company not found");
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET approvalStatus = ?, approvalReason = ?, approvedBy = ?, approvedAt = ?,
         companyUpdatedBy = ?, companyUpdatedAt = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [approvalStatus, approvalReason || null, approvedBy, currentDate(),
      approvedBy, currentDate(), companyUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Company not found", 404);
  return { message: "success", data: `Company ${approvalStatus}` };
};

exports.deleteCompany = async (companyUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE TransportCompany
     SET isDeleted = 1, companyDeletedAt = ?, companyDeletedBy = ?
     WHERE companyUniqueId = ? AND isDeleted = 0`,
    [currentDate(), deletedBy, companyUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Company not found or already deleted", 404);
  return { message: "success", data: "Company deleted" };
};
