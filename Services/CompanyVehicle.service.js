"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db, findOne, paginate, paginatedQuery } = require("./CompanyHelper.service");
const { usersRoles } = require("../Utils/ListOfSeedData");

/**
 * Assigns a vehicle to a transport company fleet.
 * @param {Object} data - The assignment data
 * @param {string} data.companyUniqueId - ID of the company
 * @param {string} data.vehicleUniqueId - ID of the vehicle being assigned
 * @param {Date} data.assignmentStartDate - Start date for the assignment
 * @param {string} data.createdByUserUniqueId - Originator of the assignment
 */
exports.assignVehicle = async (data) => {
  const {
    companyUniqueId,
    vehicleUniqueId,
    assignmentStartDate,
    assignmentEndDate,
    createdByUserUniqueId,
  } = data;

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

/**
 * @param {Object} [filters={}] - Query filters (companyUniqueId, vehicleUniqueId, status)
 * @param {Object} [user={}] - Authenticated user object for data segregation
 * @returns {Promise<Object>} Paginated list of company vehicles
 */
exports.getCompanyVehicles = async (filters = {}, user = {}) => {
  const { page, limit, offset } = paginate(filters);
  const clauses = ["companyVehicleDeletedAt IS NULL"];
  const params = [];

  // Data Segregation: Non-admins only see vehicles of companies they belong to
  if (
    user.roleId !== usersRoles.adminRoleId &&
    user.roleId !== usersRoles.supperAdminRoleId
  ) {
    clauses.push(
      `companyUniqueId IN (
        SELECT companyUniqueId FROM CompanyMembership 
        WHERE userUniqueId = ? AND membershipDeletedAt IS NULL
      )`,
    );
    params.push(user.userUniqueId);
  }

  if (filters.companyUniqueId) { clauses.push("companyUniqueId = ?"); params.push(filters.companyUniqueId); }
  if (filters.vehicleUniqueId) { clauses.push("vehicleUniqueId = ?"); params.push(filters.vehicleUniqueId); }
  if (filters.assignmentStatus) { clauses.push("assignmentStatus = ?"); params.push(filters.assignmentStatus); }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT cv.*, 
            v.licensePlate, v.color, 
            vt.vehicleTypeName, vt.carryingCapacity
     FROM CompanyVehicle cv
     JOIN Vehicle v ON cv.vehicleUniqueId = v.vehicleUniqueId
     JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
     ${where} 
     ORDER BY cv.companyVehicleCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyVehicle cv ${where}`,
    params,
    page,
    limit,
    offset,
  );
}

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
