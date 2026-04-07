"use strict";

const service = require("../Services/CompanyRole.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

/**
 * Controller to create a new company role.
 */
exports.createCompanyRole = async (req, res, next) => {
  try {
    const { userUniqueId } = req.user;
    const result = await executeInTransaction(async () => {
      return await service.createRole({ ...req.body, userUniqueId });
    });
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

/**
 * Controller to get all company roles with optional filtering and pagination.
 */
exports.getCompanyRoles = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getRoles(req.query));
  } catch (e) {
    next(e);
  }
};

/**
 * Controller to get a specific company role by its unique ID.
 */
exports.getCompanyRole = async (req, res, next) => {
  try {
    const { companyRoleUniqueId } = req.params;
    ServerResponder(res, await service.getRoleByUniqueId(companyRoleUniqueId));
  } catch (e) {
    next(e);
  }
};

/**
 * Controller to update an existing company role.
 */
exports.updateCompanyRole = async (req, res, next) => {
  try {
    const { companyRoleUniqueId } = req.params;
    const { userUniqueId } = req.user;
    const result = await executeInTransaction(async () => {
      return await service.updateRole(companyRoleUniqueId, { ...req.body, userUniqueId });
    });
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

/**
 * Controller to soft-delete a company role.
 */
exports.deleteCompanyRole = async (req, res, next) => {
  try {
    const { companyRoleUniqueId } = req.params;
    const { userUniqueId } = req.user;
    const result = await executeInTransaction(async () => {
      return await service.deleteRole(companyRoleUniqueId, userUniqueId);
    });
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
