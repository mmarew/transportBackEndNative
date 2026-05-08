const express = require("express");

const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const attachedDocumentsController = require("../Controllers/AttachedDocuments.controller");
const multer = require("multer");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const checkDuplicateDocuments = require("../Middleware/CheckDuplicateDocuments");
const {
  authorizeDocumentAccess,
} = require("../Middleware/AuthorizeDocumentAccess");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const { validator } = require("../Middleware/Validator");
const {
  getAttachedDocumentsQuery,
  attachedDocumentParams,
  userParams,
  acceptRejectDocs,
} = require("../Validations/AttachedDocuments.schema");

// ── User document upload ─────────────────────────────────────────────────────
router.post(
  "/api/user/attachDocuments/:userUniqueId",
  verifyTokenOfAxios,
  validator(userParams, "params"),
  (req, _res, next) => {
    req.ownerType = "user";
    next();
  },
  authorizeDocumentAccess(),
  upload.any(),
  checkDuplicateDocuments,
  attachedDocumentsController.createAttachedDocuments,
);

// ── Company document upload ───────────────────────────────────────────────────
router.post(
  "/api/company/attachDocuments/:companyUniqueId",
  verifyTokenOfAxios,
  (req, _res, next) => {
    req.params.userUniqueId = req.params.companyUniqueId;
    req.ownerType = "company";
    req.ownerUniqueIdParam = req.params.companyUniqueId;
    next();
  },
  authorizeDocumentAccess(),
  upload.any(),
  checkDuplicateDocuments,
  attachedDocumentsController.createAttachedDocuments,
);

// ── Vehicle document upload ───────────────────────────────────────────────────
router.post(
  "/api/vehicle/attachDocuments/:vehicleUniqueId",
  verifyTokenOfAxios,
  (req, _res, next) => {
    req.params.userUniqueId = req.params.vehicleUniqueId;
    req.ownerType = "vehicle";
    req.ownerUniqueIdParam = req.params.vehicleUniqueId;
    next();
  },
  authorizeDocumentAccess(),
  upload.any(),
  checkDuplicateDocuments,
  attachedDocumentsController.createAttachedDocuments,
);

// ── User documents GET ───────────────────────────────────────────────────────
router.get(
  "/api/user/attachedDocuments",
  verifyTokenOfAxios,
  validator(getAttachedDocumentsQuery, "query"),
  (req, _res, next) => {
    req.ownerType = "user";
    next();
  },
  authorizeDocumentAccess(),
  attachedDocumentsController.getAttachedDocumentsByFilter,
);

// ── Company documents GET ─────────────────────────────────────────────────────
router.get(
  "/api/company/attachedDocuments/:companyUniqueId",
  verifyTokenOfAxios,
  (req, _res, next) => {
    req.ownerType = "company";
    req.ownerUniqueIdParam = req.params.companyUniqueId;
    next();
  },
  authorizeDocumentAccess(),
  attachedDocumentsController.getAttachedDocumentsByFilter,
);

// ── Vehicle documents GET ─────────────────────────────────────────────────────
router.get(
  "/api/vehicle/attachedDocuments/:vehicleUniqueId",
  verifyTokenOfAxios,
  (req, _res, next) => {
    req.ownerType = "vehicle";
    req.ownerUniqueIdParam = req.params.vehicleUniqueId;
    next();
  },
  authorizeDocumentAccess(),
  attachedDocumentsController.getAttachedDocumentsByFilter,
);

// ── Update a document ────────────────────────────────────────────────────────
router.put(
  "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  verifyTokenOfAxios,
  validator(attachedDocumentParams, "params"),
  (req, _res, next) => {
    req.ownerType = "user";
    next();
  },
  authorizeDocumentAccess(),
  upload.any(),
  attachedDocumentsController.updateAttachedDocument,
);

// ── Delete a document (admin / superAdmin only) ─────────────────────────────
router.delete(
  "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(attachedDocumentParams, "params"),
  attachedDocumentsController.deleteAttachedDocument,
);

// ── Admin: accept / reject documents (admin-only) ────────────────────────────
router.put(
  "/api/admin/acceptRejectAttachedDocuments",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(acceptRejectDocs),
  attachedDocumentsController.acceptRejectAttachedDocuments,
);

// ── Document history GET ──────────────────────────────────────────────────────
// Same ownership rules as the main document GET endpoints.
// Optional query param: ?attachedDocumentUniqueId=<uuid> to narrow to one doc.

// GET /api/user/documentHistory?userUniqueId=<uuid>&attachedDocumentUniqueId=<optional>
router.get(
  "/api/user/documentHistory",
  verifyTokenOfAxios,
  (req, _res, next) => {
    req.ownerType = "user";
    next();
  },
  authorizeDocumentAccess(),
  attachedDocumentsController.getDocumentHistory,
);

// GET /api/company/documentHistory/:companyUniqueId?attachedDocumentUniqueId=<optional>
router.get(
  "/api/company/documentHistory/:companyUniqueId",
  verifyTokenOfAxios,
  (req, _res, next) => {
    req.ownerType = "company";
    req.ownerUniqueIdParam = req.params.companyUniqueId;
    next();
  },
  authorizeDocumentAccess(),
  attachedDocumentsController.getDocumentHistory,
);

// GET /api/vehicle/documentHistory/:vehicleUniqueId?attachedDocumentUniqueId=<optional>
router.get(
  "/api/vehicle/documentHistory/:vehicleUniqueId",
  verifyTokenOfAxios,
  (req, _res, next) => {
    req.ownerType = "vehicle";
    req.ownerUniqueIdParam = req.params.vehicleUniqueId;
    next();
  },
  authorizeDocumentAccess(),
  attachedDocumentsController.getDocumentHistory,
);

module.exports = router;
