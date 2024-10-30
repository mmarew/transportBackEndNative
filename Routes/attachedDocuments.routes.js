const express = require("express");
const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const attachedDocumentsController = require("../Controllers/attachedDocuments.controller");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const { verifyTokenOfAxios } = require("../Middleware/verifyToken");
// Configure Multer for file uploading
// Configure Multer for file uploading
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); // Specify where the files will be stored
  },
  filename: function (req, file, cb) {
    const userId = req.user.userId;
    const randomNumber = Math.floor(Math.random() * 10000000000);
    const uniqueName =
      userId +
      "_" +
      randomNumber +
      "_" +
      Date.now() +
      "-" +
      path.extname(file.originalname); // Unique filename with extension
    cb(null, uniqueName); // Use uniqueName as the final filename
  },
});

const upload = multer({ storage });

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
