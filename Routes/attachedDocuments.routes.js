const express = require("express");
const router = express.Router();
const attachedDocumentsController = require("../controllers/attachedDocuments.controller");
const multer = require("multer");

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

// Define routes for CRUD operations with file upload capability
router.post(
  "/attachedDocuments",
  upload.single("document"), // Handle file upload for a single document
  attachedDocumentsController.createAttachedDocument
);

router.get(
  "/attachedDocuments",
  attachedDocumentsController.getAllAttachedDocuments
);
router.get(
  "/attachedDocuments/:id",
  attachedDocumentsController.getAttachedDocumentById
);
router.put(
  "/attachedDocuments/:id",
  upload.single("document"), // Handle file upload for updates
  attachedDocumentsController.updateAttachedDocument
);
router.delete(
  "/attachedDocuments/:id",
  attachedDocumentsController.deleteAttachedDocument
);

module.exports = router;
