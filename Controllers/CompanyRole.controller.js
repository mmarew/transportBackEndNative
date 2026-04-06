"use strict";

const service = require("../Services/CompanyRole.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.getCompanyRoles = async (req, res, next) => {
  try {
    ServerResponder(res, await service.getCompanyRoles());
  } catch (e) {
    next(e);
  }
};
