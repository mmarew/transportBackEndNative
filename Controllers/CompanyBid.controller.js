"use strict";
const service = require("../Services/CompanyBid.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.submitBid = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.submitBid({
        ...req.body,
        bidSubmittedByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
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
