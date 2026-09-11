const multer = require("multer");
const path = require("path");

// SECURITY: Restrict file types for INSA Ethiopia technical compliance
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = /jpeg|jpg|png|pdf|svg/;
  const extname = allowedFileTypes.test(
    path.extname(file.originalname).toLowerCase(),
  );
  // Verify MIMETYPE to prevent binary spoofing
  const mimetype = allowedFileTypes.test(file.mimetype);

  if (extname && mimetype) {
    cb(null, true);
  } else {
    cb(new Error("Only JPEG, PNG, PDF, and SVG files are allowed!"), false);
  }
};

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    // CVE-2026-82333: reject bracket-indexed multipart field names (app uses
    // fixed field names only, no arrays — so no array index is required).
    fieldArrayIndexLimit: 0,
  },
  fileFilter: fileFilter,
});

module.exports = upload;