// Documents E2E Tests Export

const { testDocumentTypesWorkflow, testGetDocumentTypes } = require("./DocumentTypes");
const { testRoleDocumentRequirementsWorkflow, testGetRoleDocumentRequirements } = require("./RoleDocumentRequirements");

module.exports = {
  testDocumentTypesWorkflow,
  testGetDocumentTypes,
  testRoleDocumentRequirementsWorkflow,
  testGetRoleDocumentRequirements,
};
