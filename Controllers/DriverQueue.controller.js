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
    // Active-journey fence: the driver already has an order in flight. Surface
    // the in-flight journey (alreadyInJourney flag) so the driver app can
    // resume it instead of a bare empty position.
    if (result?.data?.alreadyInJourney) {
      return ServerResponder(res, result, HTTP_STATUS.OK);
    }
    // Return the canonical queue position shape (same as myPosition)
    // so the driver app always gets { queue: {...}, organization: {...} }.
    const position = await service.myPosition(
      req.body.queueOrganizationUniqueId,
      req.user,
    );
    ServerResponder(res, position, HTTP_STATUS.CREATED);
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
    const queueOrgId = (req.body && req.body.queueOrganizationUniqueId) || req.query.queueOrganizationUniqueId;
    const result = await executeInTransaction(() =>
      service.checkout(queueOrgId, req.user),
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

/**
 * GET /api/queue/entry/:queueUniqueId/history
 *
 * Returns the column-level audit history for a queue entry. Each row represents
 * ONE column change on ONE mutation (DriverQueueHistory). The current value is
 * always readable from DriverQueue itself; `oldValue` tells you what it was
 * BEFORE the change. Walk history backwards + read DriverQueue for full timeline.
 *
 * @param {import('express').Request} req - Express request (params.queueUniqueId).
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next.
 */
exports.getEntryHistory = async (req, res, next) => {
  try {
    ServerResponder(
      res,
      await service.getEntryHistory(req.params.queueUniqueId, req.user),
    );
  } catch (e) {
    next(e);
  }
};
