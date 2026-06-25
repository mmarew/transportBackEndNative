const COMPANY_VEHICLE_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  ASSIGN_VEHICLE: "/api/company/fleet",
  GET_COMPANY_VEHICLES: "/api/company/fleet",
  REMOVE_VEHICLE: "/api/company/fleet/:companyVehicleUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/fleet)
  ROUTER: {
    ASSIGN_VEHICLE: "/",
    GET_COMPANY_VEHICLES: "/",
    REMOVE_VEHICLE: "/:companyVehicleUniqueId",
  },
};

module.exports = {
  COMPANY_VEHICLE_ENDPOINTS,
};
