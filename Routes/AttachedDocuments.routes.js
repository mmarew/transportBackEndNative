const express = require("express");

const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/VerifyUsersIdentity");
const attachedDocumentsController = require("../Controllers/AttachedDocuments.controller");
const multer = require("multer");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");
const checkDuplicateDocuments = require("../Middleware/CheckDuplicateDocuments");
const { authorizeDocumentAccess } = require("../Middleware/AuthorizeDocumentAccess");

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
  (req, _res, next) => { req.ownerType = "user"; next(); },
  authorizeDocumentAccess("write"),
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
  authorizeDocumentAccess("write"),
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
  authorizeDocumentAccess("write"),
  upload.any(),
  checkDuplicateDocuments,
  attachedDocumentsController.createAttachedDocuments,
);

// ── User documents GET ───────────────────────────────────────────────────────
router.get(
  "/api/user/attachedDocuments",
  verifyTokenOfAxios,
  validator(getAttachedDocumentsQuery, "query"),
  (req, _res, next) => { req.ownerType = "user"; next(); },
  authorizeDocumentAccess("read"),
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
  authorizeDocumentAccess("read"),
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
  authorizeDocumentAccess("read"),
  attachedDocumentsController.getAttachedDocumentsByFilter,
);

// ── Update a document ────────────────────────────────────────────────────────
router.put(
  "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  verifyTokenOfAxios,
  validator(attachedDocumentParams, "params"),
  (req, _res, next) => { req.ownerType = "user"; next(); },
  authorizeDocumentAccess("write"),
  upload.any(),
  attachedDocumentsController.updateAttachedDocument,
);

// ── Delete a document ────────────────────────────────────────────────────────
router.delete(
  "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  verifyTokenOfAxios,
  validator(attachedDocumentParams, "params"),
  (req, _res, next) => { req.ownerType = "user"; next(); },
  authorizeDocumentAccess("delete"),
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

module.exports = router;
