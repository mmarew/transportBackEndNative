"use strict";

const companyDelinquencyService = require("../Services/CompanyDelinquency.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { getStatusHistory } = require("../Utils/CompanyStatusHistory");

// POST /api/admin/company-delinquency
const createCompanyDelinquency = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      companyDelinquencyService.createCompanyDelinquency({
        ...req.body,
        delinquencyCreatedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/admin/company-delinquency
const getCompanyDelinquencies = async (req, res, next) => {
  try {
    const result = await companyDelinquencyService.getCompanyDelinquencies(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// DELETE /api/admin/company-delinquency/:companyDelinquencyUniqueId
const deleteCompanyDelinquency = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      companyDelinquencyService.deleteCompanyDelinquency(req.params.companyDelinquencyUniqueId),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/admin/company-ban
const getCompanyBans = async (req, res, next) => {
  try {
    const result = await companyDelinquencyService.getCompanyBans(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// POST /api/admin/company-ban
const banCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      companyDelinquencyService.banCompany({
        ...req.body,
        bannedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// PATCH /api/admin/company-ban/:companyBanUniqueId/unban
const unbanCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      companyDelinquencyService.unbanCompany({
        companyBanUniqueId: req.params.companyBanUniqueId,
        unbannedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// GET /api/admin/companyStatusHistory/:companyUniqueId
const getCompanyStatusHistory = async (req, res, next) => {
  try {
    const { companyUniqueId } = req.params;
    const { page, limit } = req.query;
    const result = await getStatusHistory(companyUniqueId, { page, limit });
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

module.exports = {
  createCompanyDelinquency,
  getCompanyDelinquencies,
  deleteCompanyDelinquency,
  getCompanyBans,
  banCompany,
  unbanCompany,
  getCompanyStatusHistory,
};
