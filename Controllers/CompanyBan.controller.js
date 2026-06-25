"use strict";

const companyBanService = require("../Services/CompanyBan.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// GET /bans
const getCompanyBans = async (req, res, next) => {
  try {
    const result = await companyBanService.getCompanyBans(req.query);
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// POST /bans
const banCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      companyBanService.banCompany({
        ...req.body,
        bannedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

// PATCH /bans/:companyBanUniqueId/unban
const unbanCompany = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () =>
      companyBanService.unbanCompany({
        companyBanUniqueId: req.params.companyBanUniqueId,
        unbannedBy: req.user.userUniqueId,
      }),
    );
    ServerResponder(res, result);
  } catch (error) { next(error); }
};

module.exports = {
  getCompanyBans,
  banCompany,
  unbanCompany,
};
