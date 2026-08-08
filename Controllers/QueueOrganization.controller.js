"use strict";
const service = require("../Services/QueueOrganization.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

exports.createQueueOrganization = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.createQueueOrganization({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (e) {
    next(e);
  }
};

exports.getQueueOrganizations = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getQueueOrganizations(req.query, req.user));
  } catch (e) {
    next(e);
  }
};

exports.getQueueOrganization = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getQueueOrganization(req.params.queueOrganizationUniqueId, req.user));
  } catch (e) {
    next(e);
  }
};

exports.updateQueueOrganization = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.updateQueueOrganization(
        req.params.queueOrganizationUniqueId,
        req.body,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.approveQueueOrganization = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.approveQueueOrganization(
        req.params.queueOrganizationUniqueId,
        req.body.approvalStatus,
        req.body.approvalReason,
        req.user.userUniqueId,
        req.body.queueEnabled,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.deleteQueueOrganization = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.deleteQueueOrganization(
        req.params.queueOrganizationUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.addMember = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.addMember(
        req.params.queueOrganizationUniqueId,
        req.params.userUniqueId,
        req.body,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (e) {
    next(e);
  }
};

exports.getMembers = async (req, res, next) => {
  try {
    ServerResponder(
      res,
      await service.getMembers(req.params.queueOrganizationUniqueId),
    );
  } catch (e) {
    next(e);
  }
};
