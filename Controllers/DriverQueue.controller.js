"use strict";
const service = require("../Services/DriverQueue.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.checkin = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.checkin({ ...req.body, user: req.user }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.myPosition = async (req, res, next) => {
  try {
    ServerResponder(
      res,
      await service.myPosition(req.query.queueOrganizationUniqueId, req.user),
    );
  } catch (e) {
    next(e);
  }
};

exports.checkout = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.checkout(req.body.queueOrganizationUniqueId || req.query.queueOrganizationUniqueId, req.user),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.getQueueStatus = async (req, res, next) => {
  try {
    ServerResponder(
      res,
      await service.getQueueStatus(req.query.queueOrganizationUniqueId, req.query),
    );
  } catch (e) {
    next(e);
  }
};

exports.manualCheckin = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.manualCheckin({ ...req.body, user: req.user }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.overrideEntry = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.overrideEntry(req.params.queueUniqueId, req.body, req.user),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.removeEntry = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.removeEntry(req.params.queueUniqueId, req.user),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.dispatch = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.dispatch({ ...req.body, user: req.user }),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
