"use strict";

const express = require("express");
const router = express.Router();

// Import company-related routes
const transportCompanyRoutes = require("./TransportCompany.routes");
const companyMembershipRoutes = require("./CompanyMembership.routes");
const companyVehicleRoutes = require("./CompanyVehicle.routes");
const companyBidRoutes = require("./CompanyBid.routes");
const companyAssignmentRoutes = require("./CompanyAssignment.routes");

// Mount routes with appropriate sub-paths
router.use("/companies", transportCompanyRoutes);
router.use("/memberships", companyMembershipRoutes);
router.use("/fleet", companyVehicleRoutes);
router.use("/bids", companyBidRoutes);
router.use("/assignments", companyAssignmentRoutes);

module.exports = router;
