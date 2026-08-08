"use strict";
const service = require("../Services/TransportCompany.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { getHistory } = require("../Utils/CompanyProfileHistory");
const { HTTP_STATUS } = require("../Utils/Constants");

exports.createCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.createCompany({
        ...req.body,
        user: req.user,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (e) {
    next(e);
  }
};

exports.getCompanies = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getCompanies(req.query, req.user));
  } catch (e) {
    next(e);
  }
};

exports.updateCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateCompany(
        req.params.companyUniqueId,
        req.body,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.approveCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.approveCompany(
        req.params.companyUniqueId,
        req.body.approvalStatus,
        req.body.approvalReason,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteCompany(req.params.companyUniqueId, req.user.userUniqueId),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.getCompanyHistory = async (req, res, next) => {
  try {
    const { companyUniqueId } = req.params;
    const { page, limit, fieldName, source } = req.query;
    const result = await getHistory(companyUniqueId, { page, limit, fieldName, source });
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
