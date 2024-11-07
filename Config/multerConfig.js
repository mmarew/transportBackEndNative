const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Define the upload directory
const uploadDir = path.join(__dirname, "uploads");

// Ensure the 'uploads' folder exists or create it
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Check and create the folder on each upload, in case it was deleted
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir); // Folder where the files will be saved
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname); // Generate a unique filename with the original extension
    cb(null, uniqueName);
  },
});

// Set file filter (optional) - for filtering by file types (e.g., images only)
const fileFilter = (req, file, cb) => {
  const allowedFileTypes = /jpeg|jpg|png|pdf|svg/;
  const extname = allowedFileTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedFileTypes.test(file.mimetype);

  if (extname && mimetype) {
    return cb(null, true);
  } else {
    cb(new Error("Only JPEG and PNG images are allowed!"));
  }
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit file size to 5MB
  fileFilter: fileFilter,
});

// // Middleware to handle file upload errors
// const uploadFile = (req, res, next) => {
//   const singleUpload = upload.single("file"); // "file" is the name of the form field
//   singleUpload(req, res, (err) => {
//     if (err instanceof multer.MulterError) {
//       // Handle Multer-specific errors (like file size limits)
//       return res.status(400).json({ message: err.message });
//     } else if (err) {
//       // Handle other errors (e.g., unsupported file type)
//       return res.status(400).json({ message: err.message });
//     }
//     next();
//   });
// };

module.exports = upload;
