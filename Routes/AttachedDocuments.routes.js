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
const fileFilter = (req, file, cb) => {
  const allowedMimes = ["image/jpeg", "image/png", "application/pdf"];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, and PDF files are allowed!"), false);
  }
};
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const { validator } = require("../Middleware/Validator");
const {
  getAttachedDocumentsQuery,
  attachedDocumentParams,
  userParams,
  acceptRejectDocs,
} = require("../Validations/AttachedDocuments.schema");
const { ATTACHED_DOCUMENTS_ENDPOINTS } = require("./EndPoints/attachedDocuments.endpoints");

// ── User document upload ─────────────────────────────────────────────────────
router.post(
  ATTACHED_DOCUMENTS_ENDPOINTS.USER_ATTACH_DOCUMENTS,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.COMPANY_ATTACH_DOCUMENTS,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.VEHICLE_ATTACH_DOCUMENTS,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.USER_GET_DOCUMENTS,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.COMPANY_GET_DOCUMENTS,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.VEHICLE_GET_DOCUMENTS,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.USER_UPDATE_DOCUMENT,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.USER_DELETE_DOCUMENT,
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  validator(attachedDocumentParams, "params"),
  attachedDocumentsController.deleteAttachedDocument,
);

// ── Admin: accept / reject documents (admin-only) ────────────────────────────
router.put(
  ATTACHED_DOCUMENTS_ENDPOINTS.ADMIN_ACCEPT_REJECT_DOCUMENTS,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.USER_DOCUMENT_HISTORY,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.COMPANY_DOCUMENT_HISTORY,
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
  ATTACHED_DOCUMENTS_ENDPOINTS.VEHICLE_DOCUMENT_HISTORY,
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
