"use strict";
const service = require("../Services/CompanyMembership.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.addMember = async (req, res, next) => {
  try {
    let userUniqueId = req.params.userUniqueId;
    console.log("@addMember userUniqueId", userUniqueId);
    if (userUniqueId === "self") {
      userUniqueId = req.user.userUniqueId;
    }
    const result = await executeInTransaction(() =>
      service.addMember({
        ...req.body,
        userUniqueId,
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
    const user = req.user;
    // Check query instead of params for userUniqueId
    if (req.query.userUniqueId === "self") {
      req.query.userUniqueId = user.userUniqueId;
    }
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
