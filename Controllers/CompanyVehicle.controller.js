"use strict";
const service = require("../Services/CompanyVehicle.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

exports.assignVehicle = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.assignVehicle({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (e) {
    next(e);
  }
};

exports.getCompanyVehicles = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getCompanyVehicles(req.query, req.user));
  } catch (e) {
    next(e);
  }
};

exports.moveVehicle = async (req, res, next) => {
  try {
    let userUniqueId = req?.query?.userUniqueId;
    if (userUniqueId === "self") {
      userUniqueId = req.user.userUniqueId;
    }
    const result = await executeInTransaction(() =>
      service.moveVehicle({
        ...req.body,
        userUniqueId,
        assignmentStartDate: req.body.assignmentStartDate || new Date(),
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};

exports.removeVehicle = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.removeVehicle(
        req.params.companyVehicleUniqueId,
        req.user.userUniqueId,
      ),
    );
    ServerResponder(res, result);
  } catch (e) {
    next(e);
  }
};
