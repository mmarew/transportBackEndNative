"use strict";

const service = require("../Services/DriverDirectory/DriverDirectory.service");
const ServerResponder = require("../Utils/ServerResponder");

/**
 * GET /api/queue/driverDirectory
 *
 * Search driver+vehicle pairs available for manual check-in.
 */
exports.searchDriverDirectory = async (req, res, next) => {
  try {
    ServerResponder(
      res,
      await service.searchDriverDirectory({
        queueOrganizationUniqueId: req.query.queueOrganizationUniqueId,
        phone: req.query.phone,
        name: req.query.name,
        vehicleTypeUniqueId: req.query.vehicleTypeUniqueId,
        page: req.query.page,
        limit: req.query.limit,
        user: req.user,
      }),
    );
  } catch (e) {
    next(e);
  }
};