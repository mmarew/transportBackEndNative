const express = require("express");
const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const attachedDocumentsController = require("../Controllers/attachedDocuments.controller");
const multer = require("multer");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// Configure Multer for file uploading
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Specify where the files will be stored
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname); // Unique filename
  },
});

const upload = multer({ storage: storage });

// Define routes for handling multiple file uploads
router.post(
  "/api/user/attachDocuments",
  verifyTokenOfAxios,
  upload.any(),
  attachedDocumentsController.createAttachedDocuments
);

router.get(
  "/api/admin/attachedDocumentsByUser/:userUniqueId",
  verifyTokenOfAxios,
  attachedDocumentsController.getAttachedDocumentsByUser
);
router.get(
  "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  attachedDocumentsController.getAttachedDocumentByUniqueId
);
router.put(
  "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  verifyTokenOfAxios,
  upload.any(), // Handle file upload for updates
  attachedDocumentsController.updateAttachedDocument
);
router.delete(
  "/api/user/attachedDocuments/:attachedDocumentUniqueId",
  verifyTokenOfAxios,
  attachedDocumentsController.deleteAttachedDocument
);

router.put(
  "/api/admin/acceptRejectAttachedDocuments/:userUniqueId",
  verifyTokenOfAxios,
  verifyAdminsIdentity,
  attachedDocumentsController.acceptRejectAttachedDocuments
);

module.exports = router;
