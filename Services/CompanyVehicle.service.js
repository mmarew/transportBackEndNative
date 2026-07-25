"use strict";

const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const { db, findOne, paginate, paginatedQuery } = require("./CompanyHelper.service");
const { usersRoles } = require("../Utils/ListOfSeedData");

/**
 * Returns all companies a driver is associated with, via two paths:
 *   1. Direct membership  (CompanyMembership)
 *   2. Vehicle fleet      (VehicleDriver → CompanyVehicle → TransportCompany)
 *
 * This is the single source of truth for "which companies does this driver belong to?"
 * Use this instead of writing raw SQL in other services.
 *
 * @param {string} driverUserUniqueId
 * @returns {Promise<Array>} Array of company objects with a `source` field ('membership' | 'fleet')
 */
exports.getDriverCompanies = async (driverUserUniqueId) => {
  const [rows] = await db().query(
    `-- Path 1: driver is an explicit company member
     SELECT
       tc.companyUniqueId,
       tc.companyName,
       tc.companyPhone,
       tc.companyEmail,
       tc.companyAddress,
       tc.approvalStatus,
       cm.membershipUniqueId,
       cm.membershipStartDate,
       'membership' AS source
     FROM CompanyMembership cm
     JOIN TransportCompany tc ON cm.companyUniqueId = tc.companyUniqueId
     WHERE cm.userUniqueId = ?
       AND cm.membershipDeletedAt IS NULL
       AND tc.isDeleted = 0

     UNION

     -- Path 2: driver's vehicle is in a company fleet
     SELECT
       tc.companyUniqueId,
       tc.companyName,
       tc.companyPhone,
       tc.companyEmail,
       tc.companyAddress,
       tc.approvalStatus,
       NULL               AS membershipUniqueId,
       cv.assignmentStartDate AS membershipStartDate,
       'fleet'            AS source
     FROM VehicleDriver vd
     JOIN CompanyVehicle cv
        ON cv.vehicleUniqueId = vd.vehicleUniqueId
       AND cv.assignmentStatus = 'active'
       AND cv.companyVehicleDeletedAt IS NULL
     JOIN TransportCompany tc
        ON tc.companyUniqueId = cv.companyUniqueId
       AND tc.isDeleted = 0
     WHERE vd.driverUserUniqueId = ?
       AND vd.assignmentStatus = 'active'
       AND vd.assignmentEndDate IS NULL`,
    [driverUserUniqueId, driverUserUniqueId],
  );
  return rows || [];
};

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

  // A vehicle can only be in ONE company's active fleet
  const [dup] = await db().query(
    `SELECT cv.companyVehicleId, cv.companyUniqueId, tc.companyName
     FROM CompanyVehicle cv
     JOIN TransportCompany tc ON cv.companyUniqueId = tc.companyUniqueId
     WHERE cv.vehicleUniqueId = ? AND cv.assignmentStatus = 'active' AND cv.companyVehicleDeletedAt IS NULL`,
    [vehicleUniqueId],
  );
  if (dup.length > 0) {
    if (dup[0].companyUniqueId === companyUniqueId) {
      return {
        message: "success",
        data: { message: "Vehicle is already assigned to this company" },
      };
    }
    const existing = dup[0].companyName
      ? `"${dup[0].companyName}"`
      : "another company";
    throw new AppError(`Vehicle is already assigned to ${existing}`, 409);
  }

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
 * Moves a vehicle from its current company fleet to a new one.
 * If the vehicle is already in the target company, returns success (no-op).
 * If it's in a different company, the old assignment is soft-deleted first.
 *
 * @param {Object} data
 * @param {string} data.companyUniqueId - Target company UUID
 * @param {string} data.vehicleUniqueId  - Vehicle UUID to move
 * @param {Date}   data.assignmentStartDate - Start date for new assignment
 * @param {string} data.createdByUserUniqueId - User performing the move
 */
exports.moveVehicle = async (data) => {
  const {
    companyUniqueId,
    vehicleUniqueId,
    assignmentStartDate,
    assignmentEndDate,
    createdByUserUniqueId,
  } = data;

  await findOne("TransportCompany", { companyUniqueId, isDeleted: 0 }, "Company not found");

  const [existing] = await db().query(
    `SELECT cv.companyVehicleUniqueId, cv.companyUniqueId, tc.companyName
     FROM CompanyVehicle cv
     JOIN TransportCompany tc ON cv.companyUniqueId = tc.companyUniqueId
     WHERE cv.vehicleUniqueId = ? AND cv.assignmentStatus = 'active' AND cv.companyVehicleDeletedAt IS NULL`,
    [vehicleUniqueId],
  );

  if (existing.length > 0) {
    if (existing[0].companyUniqueId === companyUniqueId) {
      return {
        message: "success",
        data: { message: "Vehicle is already assigned to this company" },
      };
    }
    await db().query(
      `UPDATE CompanyVehicle
       SET assignmentStatus = 'inactive', companyVehicleDeletedAt = ?, companyVehicleDeletedBy = ?
       WHERE companyVehicleUniqueId = ?`,
      [currentDate(), createdByUserUniqueId, existing[0].companyVehicleUniqueId],
    );
  }

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

  const { userUniqueId, roleId } = user;
  const isAdmin =
    roleId === usersRoles.adminRoleId ||
    roleId === usersRoles.supperAdminRoleId;

  let resolvedCompanyUniqueId = null;

  if (isAdmin) {
    // Admins can see everything or target a specific company
    resolvedCompanyUniqueId = filters.companyUniqueId || null;
  } else {
    // Standard users MUST resolve to their own company
    const [membership] = await db().query(
      `SELECT companyUniqueId FROM CompanyMembership 
       WHERE userUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL`,
      [userUniqueId],
    );

    if (!membership || membership.length === 0) {
      throw new AppError(
        "User is not an active member of any transport company",
        403,
      );
    }

    if (filters.companyUniqueId) {
      const isMember = membership.some(
        (m) => m.companyUniqueId === filters.companyUniqueId,
      );
      if (!isMember) {
        throw new AppError(
          "Access Denied: You are not an active member of the specified company",
          403,
        );
      }
      resolvedCompanyUniqueId = filters.companyUniqueId;
    } else {
      if (membership.length === 1) {
        resolvedCompanyUniqueId = membership[0].companyUniqueId;
      } else {
        throw new AppError(
          "You belong to multiple companies. Please provide companyUniqueId in your query to specify which company you are fetching data for.",
          400,
        );
      }
    }
  }

  if (resolvedCompanyUniqueId) {
    clauses.push("cv.companyUniqueId = ?");
    params.push(resolvedCompanyUniqueId);
  }

  if (filters.vehicleUniqueId) {
    clauses.push("cv.vehicleUniqueId = ?");
    params.push(filters.vehicleUniqueId);
  }
  if (filters.assignmentStatus) {
    clauses.push("cv.assignmentStatus = ?");
    params.push(filters.assignmentStatus);
  }
  if (filters.carryingCapacity) {
    clauses.push("vt.carryingCapacity = ?");
    params.push(filters.carryingCapacity);
  }
  if (filters.vehicleTypeName) {
    clauses.push("vt.vehicleTypeName LIKE ?");
    params.push(`%${filters.vehicleTypeName}%`);
  }

  const where = `WHERE ${clauses.join(" AND ")}`;
  return paginatedQuery(
    `SELECT cv.*,
            v.licensePlate, v.color,
            vt.vehicleTypeName, vt.carryingCapacity,
            vd.driverUserUniqueId,
            vd.assignmentStartDate AS driverAssignmentStartDate,
            u.fullName  AS driverFullName,
            u.phoneNumber AS driverPhoneNumber,
            u.email AS driverEmail
     FROM CompanyVehicle cv
     JOIN Vehicle v ON cv.vehicleUniqueId = v.vehicleUniqueId
     JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
     LEFT JOIN VehicleDriver vd
            ON vd.vehicleUniqueId = cv.vehicleUniqueId
           AND vd.assignmentStatus = 'active'
           AND vd.assignmentEndDate IS NULL
     LEFT JOIN Users u ON u.userUniqueId = vd.driverUserUniqueId
     ${where}
     ORDER BY cv.companyVehicleCreatedAt DESC`,
    `SELECT COUNT(*) AS total FROM CompanyVehicle cv
     JOIN Vehicle v ON cv.vehicleUniqueId = v.vehicleUniqueId
     JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
     ${where}`,
    params,
    page,
    limit,
    offset,
  );
};

exports.removeVehicle = async (companyVehicleUniqueId, deletedBy) => {
  const [res] = await db().query(
    `UPDATE CompanyVehicle
     SET assignmentStatus = 'inactive', companyVehicleDeletedAt = ?, companyVehicleDeletedBy = ?
     WHERE companyVehicleUniqueId = ? AND companyVehicleDeletedAt IS NULL`,
    [currentDate(), deletedBy, companyVehicleUniqueId],
  );
  if (res.affectedRows === 0) {throw new AppError("Fleet assignment not found or already removed", 404);}
  return { message: "success", data: "Vehicle removed from fleet" };
};
