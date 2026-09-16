"use strict";

const express = require("express");
const router = express.Router();

// Import company-related routes
const transportCompanyRoutes = require("./TransportCompany.routes");
const companyMembershipRoutes = require("./CompanyMembership.routes");
const companyVehicleRoutes = require("./CompanyVehicle.routes");
const companyBidRoutes = require("./CompanyBid.routes");
const companyAssignmentRoutes = require("./CompanyAssignment.routes");
const companyRoleRoutes = require("./CompanyRole.routes");
const companyDelinquency = require("./CompanyDelinquency.routes");
const companyBan = require("./CompanyBan.routes");
const companyRatting = require("./CompanyRating.routes");
const companyDelinquencyDispute = require("./CompanyDelinquencyResponces.routes");
const adminDecisionOnDelinquency = require("./AdminDecisionOnDelinquency.routes");

// Import endpoint constants for mount prefixes
const { TRANSPORT_COMPANY_ENDPOINTS } = require("../EndPoints/transportCompany.endpoints");
const { COMPANY_MEMBERSHIP_ENDPOINTS } = require("../EndPoints/companyMembership.endpoints");
const { COMPANY_VEHICLE_ENDPOINTS } = require("../EndPoints/companyVehicle.endpoints");
const { COMPANY_BID_ENDPOINTS } = require("../EndPoints/companyBid.endpoints");
const { COMPANY_ASSIGNMENT_ENDPOINTS } = require("../EndPoints/companyAssignment.endpoints");
const { COMPANY_ROLE_ENDPOINTS } = require("../EndPoints/companyRole.endpoints");
const { COMPANY_BAN_ENDPOINTS } = require("../EndPoints/companyBan.endpoints");
const { ADMIN_DECISION_ON_DELINQUENCY_ENDPOINTS } = require("../EndPoints/adminDecisionOnDelinquency.endpoints");
const { COMPANY_DELINQUENCY_ENDPOINTS } = require("../EndPoints/companyDelinquency.endpoints");
const { COMPANY_DELINQUENCY_RESPONCES_ENDPOINTS } = require("../EndPoints/companyDelinquencyResponces.endpoints");
const { COMPANY_RATING_ENDPOINTS } = require("../EndPoints/companyRating.endpoints");

// Mount routes with appropriate sub-paths
router.use(COMPANY_BAN_ENDPOINTS.MOUNT, companyBan);
router.use(ADMIN_DECISION_ON_DELINQUENCY_ENDPOINTS.MOUNT, adminDecisionOnDelinquency); // admin rulings (CRUD)
router.use(COMPANY_DELINQUENCY_ENDPOINTS.MOUNT, companyDelinquency);
router.use(COMPANY_DELINQUENCY_RESPONCES_ENDPOINTS.MOUNT, companyDelinquencyDispute); // company dispute responses only
router.use(COMPANY_RATING_ENDPOINTS.MOUNT, companyRatting);
router.use(TRANSPORT_COMPANY_ENDPOINTS.MOUNT, transportCompanyRoutes);
router.use(COMPANY_MEMBERSHIP_ENDPOINTS.MOUNT, companyMembershipRoutes);
router.use(COMPANY_VEHICLE_ENDPOINTS.MOUNT, companyVehicleRoutes);
router.use(COMPANY_BID_ENDPOINTS.MOUNT, companyBidRoutes);
router.use(COMPANY_ASSIGNMENT_ENDPOINTS.MOUNT, companyAssignmentRoutes);
router.use(COMPANY_ROLE_ENDPOINTS.MOUNT, companyRoleRoutes);

module.exports = router;
