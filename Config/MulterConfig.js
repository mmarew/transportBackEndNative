// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");
// const { v4: uuidv4 } = require("uuid");

// // Define the upload directory
// const uploadDir = path.join(__dirname, "../uploads");

// // Ensure the 'uploads' folder exists or create it
// if (!fs.existsSync(uploadDir)) {
//   fs.mkdirSync(uploadDir, { recursive: true });
// }

// // Configure Multer for file uploads
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     if (!fs.existsSync(uploadDir)) {
//       fs.mkdirSync(uploadDir, { recursive: true });
//     }
//     cb(null, uploadDir);
//   },
//   filename: (req, file, cb) => {
//     const uniqueName = uuidv4() + path.extname(file.originalname);
//     cb(null, uniqueName);
//   },
// });

// // Set file filter
// const fileFilter = (req, file, cb) => {
//   const allowedFileTypes = /jpeg|jpg|png|pdf|svg/;
//   const extname = allowedFileTypes.test(
//     path.extname(file.originalname).toLowerCase()
//   );
//   const mimetype = allowedFileTypes.test(file.mimetype);

//   if (extname && mimetype) {
//     cb(null, true);
//   } else {
//     cb(new Error("Only JPEG, PNG, PDF, and SVG files are allowed!"));
//   }
// };

// // Multer configuration
// const upload = multer({
//   storage: storage,
//   limits: { fileSize: 5 * 1024 * 1024 },
//   fileFilter: fileFilter,
// });

// module.exports = upload;

const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

// Set file filter with error handling
const fileFilter = (req, file, cb) => {
  try {
    const allowedFileTypes = /jpeg|jpg|png|pdf|svg/;
    const extname = allowedFileTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedFileTypes.test(file.mimetype);

    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error("Only JPEG, PNG, PDF, and SVG files are allowed!"), false);
    }
  } catch (error) {
    cb(error, false);
  }
};

// Multer configuration with error handling
const createMulterUpload = () => {
  try {
    const storage = multer.memoryStorage();

    const upload = multer({
      storage: storage,
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
      fileFilter: fileFilter,
    });

    return upload;
  } catch (error) {
    console.error("Failed to configure Multer:", error);
    throw new Error("File upload configuration failed");
  }
};

// Create upload middleware with error wrapper
const upload = createMulterUpload();

// Helper function to handle multer errors in routes
const handleUploadError = (error, req, res, next) => {
  try {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File too large. Maximum size is 5MB.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${error.message}`,
      });
    } else if (error) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }
    next();
  } catch (handlerError) {
    console.error("Error in upload error handler:", handlerError);
    res.status(500).json({
      success: false,
      message: "Internal server error in file processing",
    });
  }
};

module.exports = { upload, handleUploadError };
