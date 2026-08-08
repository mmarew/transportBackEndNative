"use strict";
const service = require("../Services/DriverQueue.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

exports.checkin = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.checkin({ ...req.body, user: req.user }),
    );
    ServerResponder(res, result, HTTP_STATUS.CREATED);
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
    console.log('[Checkout] Request received:', {
      method: req.method,
      url: req.url,
      query: req.query,
      body: req.body,
      user: req.user ? { userUniqueId: req.user.userUniqueId, phoneNumber: req.user.phoneNumber, roleId: req.user.roleId } : null
    });
    const queueOrgId = (req.body && req.body.queueOrganizationUniqueId) || req.query.queueOrganizationUniqueId;
    console.log('[Checkout] queueOrgId:', queueOrgId);
    const result = await executeInTransaction(() =>
      service.checkout(queueOrgId, req.user),
    );
    ServerResponder(res, result);
  } catch (e) {
    console.error('[Checkout] Error:', e.message, e.stack);
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
    ServerResponder(res, result, HTTP_STATUS.CREATED);
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
