// Status E2E Tests Export

const { testStatusWorkflow, testGetStatuses } = require("./Status");
const { testUserRoleStatusWorkflow, testGetUserRoleStatusCurrent } = require("./UserRoleStatus");

// Re-export UserStatus from Roles folder (already exists there)
const { testUserStatusWorkflow } = require("../Roles/UserStatus");

module.exports = {
  testStatusWorkflow,
  testGetStatuses,
  testUserRoleStatusWorkflow,
  testGetUserRoleStatusCurrent,
  testUserStatusWorkflow,
};
