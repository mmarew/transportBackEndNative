"use strict";

const service = require("../Services/CompanyRating.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.createCompanyRating = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      service.createCompanyRating({
        ...req.body,
        ratedByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (err) { next(err); }
};

exports.getCompanyRatings = async (req, res, next) => {
  try {
    const result = await service.getCompanyRatings(req.query);
    ServerResponder(res, result);
  } catch (err) { next(err); }
};

exports.getCompanyAverageRating = async (req, res, next) => {
  try {
    const result = await service.getCompanyAverageRating(req.params.companyUniqueId);
    ServerResponder(res, result);
  } catch (err) { next(err); }
};

exports.updateCompanyRating = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      service.updateCompanyRating(req.params.companyRatingUniqueId, {
        ...req.body,
        updatedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (err) { next(err); }
};

exports.deleteCompanyRating = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      service.deleteCompanyRating(
        req.params.companyRatingUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (err) { next(err); }
};
