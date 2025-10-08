const express = require("express");
const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const RoleDocumentRequirementsController = require("../Controllers/RoleDocumentRequirements.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// Create a new role-document mapping
router.post(
  "/api/RoleDocumentRequirements",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.createMapping
);
// Consolidated filterable GET (paginated)
router.get(
  "/api/RoleDocumentRequirements",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.getRoleDocumentRequirements
);
// Update a mapping by ID
router.put(
  "/api/RoleDocumentRequirements/:roleDocumentRequirementUniqueId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.updateMapping
);
// Delete a mapping by ID
router.delete(
  "/api/RoleDocumentRequirements/:roleDocumentRequirementUniqueId",
  verifyTokenOfAxios,
  RoleDocumentRequirementsController.deleteMapping
);
module.exports = router;
