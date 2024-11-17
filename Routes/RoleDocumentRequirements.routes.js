const express = require("express");
const router = express.Router();
const RoleDocumentRequirementsController = require("../Controllers/RoleDocumentRequirements.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// Create a new role-document mapping
router.post(
  "/RoleDocumentRequirements",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.createMapping
);

router.get(
  "/api/user/getMappingByRoleUniqueId/:roleUniqueId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.getMappingByRoleUniqueId
);
// Update a mapping by ID
router.put(
  "/RoleDocumentRequirements/:roleDocumentRequirementUniqueId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.updateMapping
);

// Delete a mapping by ID
router.delete(
  "/RoleDocumentRequirements/:roleDocumentRequirementUniqueId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.deleteMapping
);

module.exports = router;
