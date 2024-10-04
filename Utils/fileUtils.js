// utils/fileUtils.js
const fs = require("fs");

const deleteFile = (fullPath) => {
  fs.unlink(fullPath, (err) => {
    if (err) {
      console.error(`Error deleting file: ${fullPath}`, err);
    } else {
      console.log(`File deleted: ${fullPath}`);
    }
  });
};

module.exports = { deleteFile };
