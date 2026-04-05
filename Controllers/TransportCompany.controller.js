"use strict";
const service = require("../Services/TransportCompany.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.createCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.createCompany({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getCompanies = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getCompanies(req.query));
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
