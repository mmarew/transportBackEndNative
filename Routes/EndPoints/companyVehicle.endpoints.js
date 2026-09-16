const COMPANY_VEHICLE_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  ASSIGN_VEHICLE: "/api/company/fleet",
  GET_COMPANY_VEHICLES: "/api/company/fleet",
  MOVE_VEHICLE: "/api/company/fleet",
  REMOVE_VEHICLE: "/api/company/fleet/:companyVehicleUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/fleet)
  ROUTER: {
    ASSIGN_VEHICLE: "/",
    GET_COMPANY_VEHICLES: "/",
    MOVE_VEHICLE: "/",
    REMOVE_VEHICLE: "/:companyVehicleUniqueId",
  },

  // Mount prefix — used by company/index.js
  MOUNT: "/fleet",
};

module.exports = {
  COMPANY_VEHICLE_ENDPOINTS,
};
