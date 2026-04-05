"use strict";
const service = require("../Services/CompanyMembership.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.addMember = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.addMember({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getMembers = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getMembers(req.query));
  } catch (e) {
    next(e);
  }
};

exports.deactivateMember = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deactivateMember(
        req.params.membershipUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteMember = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteMember(
        req.params.membershipUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
