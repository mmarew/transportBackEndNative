const COMPANY_ASSIGNMENT_ENDPOINTS = {
  // Full paths — used by E2E tests to build request URLs
  CREATE_ASSIGNMENT: "/api/company/assignments",
  BULK_ASSIGN: "/api/company/assignments/bulk",
  AUTO_ASSIGN: "/api/company/assignments/auto",
  GET_ASSIGNMENTS: "/api/company/assignments",
  UPDATE_ASSIGNMENT_STATUS: "/api/company/assignments/:assignmentUniqueId/status",
  DELETE_ASSIGNMENT: "/api/company/assignments/:assignmentUniqueId",

  // Relative paths — used by Express router (already mounted at /api/company/assignments)
  ROUTER: {
    CREATE_ASSIGNMENT: "/",
    BULK_ASSIGN: "/bulk",
    AUTO_ASSIGN: "/auto",
    GET_ASSIGNMENTS: "/",
    UPDATE_ASSIGNMENT_STATUS: "/:assignmentUniqueId/status",
    DELETE_ASSIGNMENT: "/:assignmentUniqueId",
  },
};

module.exports = {
  COMPANY_ASSIGNMENT_ENDPOINTS,
};
