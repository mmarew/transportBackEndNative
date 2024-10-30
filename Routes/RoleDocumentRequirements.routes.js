const express = require("express");
const router = express.Router();
const RoleDocumentRequirementsController = require("../controllers/RoleDocumentRequirements.controller");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// Create a new role-document mapping
router.post(
  "/RoleDocumentRequirements",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.createMapping
);

// Get all role-document mappings
router.get(
  "/RoleDocumentRequirementsByRole/:roleId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.getAllMappings
);

// Get a specific mapping by ID
router.get(
  "/RoleDocumentRequirements/:id",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.getMappingById
);
router.get(
  "/api/admin/getMappingByRoleId/:id",
  RoleDocumentRequirementsController.getMappingByRoleId
);
// Update a mapping by ID
router.put(
  "/RoleDocumentRequirements/:id",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.updateMapping
);

// Delete a mapping by ID
router.delete(
  "/RoleDocumentRequirements/:id",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.deleteMapping
);

module.exports = router;
