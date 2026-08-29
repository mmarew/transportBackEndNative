// Documents E2E Tests Export

const { testDocumentTypesWorkflow, testGetDocumentTypes } = require("./DocumentTypes");
const { testRoleDocumentRequirementsWorkflow, testGetRoleDocumentRequirements } = require("./RoleDocumentRequirements");
const {
  testGetAttachedDocuments,
  testDeleteAttachedDocument,
  testGetDocumentHistory,
  testUpdateAttachedDocument,
  testGetCompanyAttachedDocuments,
  testGetCompanyDocumentHistory,
  testGetVehicleAttachedDocuments,
  testGetVehicleDocumentHistory,
  testGetProfileHistory,
} = require("./UserDocuments");

const { testGracePeriodWorkflow } = require("./GracePeriod");

module.exports = {
  testDocumentTypesWorkflow,
  testGetDocumentTypes,
  testRoleDocumentRequirementsWorkflow,
  testGetRoleDocumentRequirements,
  testGetAttachedDocuments,
  testDeleteAttachedDocument,
  testGetDocumentHistory,
  testUpdateAttachedDocument,
  testGetCompanyAttachedDocuments,
  testGetCompanyDocumentHistory,
  testGetVehicleAttachedDocuments,
  testGetVehicleDocumentHistory,
  testGetProfileHistory,
  testGracePeriodWorkflow,
};
