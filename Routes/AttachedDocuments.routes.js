const express = require("express");
const router = express.Router();
const { verifyAdminsIdentity } = require("../Middleware/verifyUsersIdentity");
const attachedDocumentsController = require("../Controllers/AttachedDocuments.controller");
const multer = require("multer");
const path = require("path");
const { verifyTokenOfAxios } = require("../Middleware/VerifyToken");

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
// get Attached Documents By User unique id
router.get(
  "/api/admin/attachedDocumentsByUser/:userUniqueId",
  verifyTokenOfAxios,
  attachedDocumentsController.getAttachedDocumentsByUser
);
// get Attached Documents By User unique id and document type id
router.get(
  "/api/admin/attachedDocumentsByUser/:userUniqueId/:documentTypeId",
  verifyTokenOfAxios,
  attachedDocumentsController.getAttachedDocumentsByUserUniqueIdAndDocumentTypeId
);
//get attached Document by document UniqueId
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
