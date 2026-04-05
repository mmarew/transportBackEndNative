"use strict";
const service = require("../Services/CompanyVehicle.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

exports.assignVehicle = async (req, res, next) => {
  try {
    const result = await executeInTransaction(() =>
      service.assignVehicle({
        ...req.body,
        createdByUserUniqueId: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result, 201);
  } catch (e) {
    next(e);
  }
};

exports.getCompanyVehicles = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getCompanyVehicles(req.query));
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
