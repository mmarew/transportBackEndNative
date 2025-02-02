// utils/fileUtils.js
const fs = require("fs");
const path = require("path");

const deleteFile = (attachedDocumentName) => {
  if (attachedDocumentName === null || attachedDocumentName === undefined) {
    console.log(
      "Error deleting file: attachedDocumentName is null or undefined"
    );
    return;
  }

  const fullPath = path.resolve(
    __dirname, // Get the file path relative to the current file's directory
    "..", // Navigate up one level (from services folder)
    "uploads/" + attachedDocumentName
  );
  if (!fs.existsSync(fullPath)) {
    console.log(`Error deleting file: ${fullPath} does not exist`);
    return;
  }

  fs.unlink(fullPath, (err) => {
    if (err) {
      console.log(`Error deleting file: ${fullPath}`, err);
    }
  });
};

module.exports = { deleteFile };
