const express = require("express");
const router = express.Router();
const documentTypesController = require("../Controllers/DocumentTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");

// Define routes for CRUD operations with camelCase
router.post(
  "/api/documentTypes",
  verifyTokenOfAxios,
  documentTypesController.createDocumentType
);
router.get(
  "/api/documentTypes",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.getAllDocumentTypes
);
router.get(
  "/api/documentTypes/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.getDocumentTypeById
);
router.put(
  "/api/documentTypes/:documentTypeUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.updateDocumentType
);
router.delete(
  "/api/documentTypes/:documentTypeUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.deleteDocumentType
);

module.exports = router;
