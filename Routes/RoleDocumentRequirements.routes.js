const express = require("express");
const router = express.Router();
const RoleDocumentRequirementsController = require("../Controllers/RoleDocumentRequirements.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { validator } = require("../Middleware/Validator");
const {
  createRoleDocumentRequirement,
  updateRoleDocumentRequirement,
  getRoleDocumentRequirementsQuery,
  roleDocumentRequirementParams,
} = require("../Validations/RoleDocumentRequirements.schema");
const { ROLE_DOCUMENT_REQUIREMENTS_ENDPOINTS } = require("./EndPoints/roleDocumentRequirements.endpoints");

// Create a new role-document mapping
router.post(
  ROLE_DOCUMENT_REQUIREMENTS_ENDPOINTS.CREATE_ROLE_DOCUMENT_REQUIREMENT,
  verifyTokenOfAxios,
  validator(createRoleDocumentRequirement),
  RoleDocumentRequirementsController.createMapping,
);
// Consolidated filterable GET (paginated)
router.get(
  ROLE_DOCUMENT_REQUIREMENTS_ENDPOINTS.GET_ROLE_DOCUMENT_REQUIREMENTS,
  verifyTokenOfAxios,
  validator(getRoleDocumentRequirementsQuery, "query"),
  RoleDocumentRequirementsController.getRoleDocumentRequirements,
);
// Update a mapping by ID
router.put(
  ROLE_DOCUMENT_REQUIREMENTS_ENDPOINTS.UPDATE_ROLE_DOCUMENT_REQUIREMENT,
  verifyTokenOfAxios,
  validator(roleDocumentRequirementParams, "params"),
  validator(updateRoleDocumentRequirement),
  RoleDocumentRequirementsController.updateMapping,
);
// Delete a mapping by ID
router.delete(
  ROLE_DOCUMENT_REQUIREMENTS_ENDPOINTS.DELETE_ROLE_DOCUMENT_REQUIREMENT,
  verifyTokenOfAxios,
  validator(roleDocumentRequirementParams, "params"),
  RoleDocumentRequirementsController.deleteMapping,
);
module.exports = router;
