const express = require("express");
const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const RoleDocumentRequirementsController = require("../Controllers/RoleDocumentRequirements.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// Create a new role-document mapping
router.post(
  "/RoleDocumentRequirements",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.createMapping
);
router.get(
  "/api/user/driversDocumentVehicleRequirement/:userUniqueId",
  verifyTokenOfAxios,

  RoleDocumentRequirementsController.driversDocumentVehicleRequirement
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
// Update a mapping by ID
router.get(
  "/RoleDocumentRequirements/:roleDocumentRequirementUniqueId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.getMappingByRoleDocumentRequirementUniqueId
);

// Delete a mapping by ID
router.delete(
  "/RoleDocumentRequirements/:roleDocumentRequirementUniqueId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.deleteMapping
);
// get all mappings
router.get(
  "/api/admin/getAllMappings",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  RoleDocumentRequirementsController.getAllMappings
);
module.exports = router;
