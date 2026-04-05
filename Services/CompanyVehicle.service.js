"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db, findOne, paginate, paginatedQuery } = require("./CompanyHelper.service");

exports.assignVehicle = async (data) => {
  const { companyUniqueId, vehicleUniqueId, assignmentStartDate,
    assignmentEndDate, createdByUserUniqueId } = data;

  await findOne("TransportCompany", { companyUniqueId, isDeleted: 0 }, "Company not found");

  // One active vehicle per company
  const [dup] = await db().query(
    `SELECT companyVehicleId FROM CompanyVehicle
     WHERE companyUniqueId = ? AND vehicleUniqueId = ? AND assignmentStatus = 'active' AND companyVehicleDeletedAt IS NULL`,
    [companyUniqueId, vehicleUniqueId],
  );
  if (dup.length > 0) throw new AppError("Vehicle is already assigned to this company", 409);

  const companyVehicleUniqueId = uuidv4();
  await db().query(
    `INSERT INTO CompanyVehicle
      (companyVehicleUniqueId, companyUniqueId, vehicleUniqueId,
       assignmentStatus, assignmentStartDate, assignmentEndDate,
       companyVehicleCreatedBy, companyVehicleCreatedAt)
     VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
    [companyVehicleUniqueId, companyUniqueId, vehicleUniqueId,
      assignmentStartDate, assignmentEndDate || null,
      createdByUserUniqueId, currentDate()],
  );
  return { message: "success", data: { companyVehicleUniqueId } };
};

exports.getCompanyVehicles = async (filters = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyVehicleDeletedAt IS NULL"];
  const params = [];

  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.vehicleUniqueId) { clauses.push("vehicleUniqueId = ?"); params.push(filters.vehicleUniqueId); }
  if (filters.assignmentStatus) { clauses.push("assignmentStatus = ?"); params.push(filters.assignmentStatus); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT * FROM CompanyVehicle ${where} ORDER BY companyVehicleCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyVehicle ${where}`,
    params, page, limit, offset,
  );
};

exports.removeVehicle = async (companyVehicleUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyVehicle
     SET assignmentStatus = 'inactive', companyVehicleDeletedAt = ?, companyVehicleDeletedBy = ?
     WHERE companyVehicleUniqueId = ? AND companyVehicleDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyVehicleUniqueId],
  );
  if (res.affectedRows === 0) throw new AppError("Fleet assignment not found or already removed", 404);
  return { message: "success", data: "Vehicle removed from fleet" };
};
