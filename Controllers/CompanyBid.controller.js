"use strict";
const service = require("../Services/CompanyBid");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

exports.submitBid = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.submitBid({
        ...req.body,
        bidSubmittedByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (e) {
    next(e);
  }
};

exports.getBids = async (req, res, next) => {
  try {
    ServerResponder(
      res,
      await service.getBids(req.query, req.user.userUniqueId, req.user.roleId),
    );
  } catch (e) {
    next(e);
  }
};

exports.updateBidStatus = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateBidStatus(
        req.params.companyBidRequestUniqueId,
        req.body.bidStatus,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteBid = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteBid(
        req.params.companyBidRequestUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.markCancellationAsSeen = async (req, res, next) => {
  try {
    const result = await service.markCancellationAsSeen({
      companyBidRequestUniqueId: req.params.companyBidRequestUniqueId,
      userUniqueId: req.user.userUniqueId,
    });
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
