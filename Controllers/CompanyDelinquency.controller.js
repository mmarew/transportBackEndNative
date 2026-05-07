"use strict";

const companyDelinquencyService = require("../Services/CompanyDelinquency.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { getHistory } = require("../Utils/CompanyProfileHistory");

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



module.exports = {
  createCompanyDelinquency,
  getCompanyDelinquencies,
  deleteCompanyDelinquency,
};
