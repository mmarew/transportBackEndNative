// utils/fileUtils.js
const fs = require("fs");
const path = require("path");

const deleteFile = (attachedDocumentName) => {
  const fullPath = path.resolve(
    __dirname, // Get the file path relative to the current file's directory
    "..", // Navigate up one level (from services folder)
    "uploads/" + attachedDocumentName
  );
  fs.unlink(fullPath, (err) => {
    if (err) {
      console.error(`Error deleting file: ${fullPath}`, err);
    } else {
      console.log(`File deleted: ${fullPath}`);
    }
  });
};

module.exports = { deleteFile };
