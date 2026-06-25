// utils/fileUtils.js
const fs = require("fs");
const path = require("path");
// this is used to delete the old files when updating the new files
const deleteFile = (attachedDocumentName) => {
  try {
    if (attachedDocumentName === null || attachedDocumentName === undefined) {
      return;
    }

    const fullPath = path.resolve(
      __dirname, // Get the file path relative to the current file's directory
      "..", // Navigate up one level (from services folder)
      "uploads/" + attachedDocumentName,
    );
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    if (!fs.existsSync(fullPath)) {
      return;
    }

    // eslint-disable-next-line security/detect-non-literal-fs-filename
    fs.unlink(fullPath, (err) => {
      if (err) {
        const logger = require("./logger");
        logger.error("Error deleting file", {
          fullPath,
          error: err.message,
          stack: err.stack,
        });
      }
    });
  } catch (error) {
    const logger = require("./logger");
    logger.error("Error in deleteFile", {
      attachedDocumentName,
      error: error.message,
      stack: error.stack,
    });
    return;
  }
};

module.exports = { deleteFile };
