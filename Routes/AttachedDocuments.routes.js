const express = require("express");

const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const attachedDocumentsController = require("../Controllers/AttachedDocuments.controller");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
// Single reusable multer instance (Config/MulterConfig) used across the whole
// project — memory storage, 10MB/file, JPEG/PNG/PDF/SVG, fieldArrayIndexLimit 0.
const upload = require("../Config/MulterConfig");
const checkDuplicateDocuments = require("../Middleware/CheckDuplicateDocuments");
const {
  authorizeDocumentAccess,
} = require("../Middleware/AuthorizeDocumentAccess");
const {
  resolveDocumentOwner,
} = require("../Middleware/ResolveDocumentOwner");

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
// Same owner-resolved authorization as delete: the document row decides whether
// this is a user, company or vehicle document.
router.put(
  ATTACHED_DOCUMENTS_ENDPOINTS.USER_UPDATE_DOCUMENT,
  verifyTokenOfAxios,
  validator(attachedDocumentParams, "params"),
  resolveDocumentOwner(),
  authorizeDocumentAccess(),
  upload.any(),
  attachedDocumentsController.updateAttachedDocument,
);

// ── Delete a document ────────────────────────────────────────────────────────
// Ownership is resolved from the document row itself, then the shared
// authorizeDocumentAccess() rules decide access:
//   Admin (3) / SuperAdmin (6) → any document
//   own user document            → its owner
//   company document             → CompanyAdmin (7) / Dispatcher (10) who are
//                                  active owner/manager/dispatcher members
router.delete(
  ATTACHED_DOCUMENTS_ENDPOINTS.USER_DELETE_DOCUMENT,
  verifyTokenOfAxios,
  validator(attachedDocumentParams, "params"),
  resolveDocumentOwner(),
  authorizeDocumentAccess(),
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
