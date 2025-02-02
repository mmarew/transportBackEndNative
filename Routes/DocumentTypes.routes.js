const express = require("express");
const router = express.Router();
const documentTypesController = require("../Controllers/DocumentTypes.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");

// Define routes for CRUD operations with camelCase
router.post(
  "/documentTypes",
  verifyTokenOfAxios,
  documentTypesController.createDocumentType
);
router.get(
  "/documentTypes",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.getAllDocumentTypes
);
router.get(
  "/documentTypes/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.getDocumentTypeById
);
router.put(
  "/documentTypes/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.updateDocumentType
);
router.delete(
  "/documentTypes/:id",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  documentTypesController.deleteDocumentType
);

module.exports = router;
