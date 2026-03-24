"use strict";

/**
 * LocalFileHandler.js (was FTPHandler.js)
 *
 * Previously, files were uploaded to an FTP server (cPanel / Yegara host)
 * because the app was deployed on Vercel which has no persistent filesystem.
 *
 * Now that the app runs on a VPS (dynamicsroute.tech), files are saved
 * directly to the local filesystem under /uploads/. Express serves these
 * files as static assets via APP_API_URL/uploads/<filename>.
 *
 * Exports (kept identical so no callers need to change their import):
 *   - uploadToFTP(buffer, filename)  → saves to disk, returns public URL
 *   - deleteFromFTP(filename)        → deletes from disk
 */

const fs = require("fs");
const path = require("path");
const logger = require("./logger");
const Config = require("./Config");

/**
 * Absolute path to the uploads folder on the VPS.
 * Files will be created at: <projectRoot>/uploads/<filename>
 */
const UPLOADS_DIR = path.join(__dirname, "..", "uploads");

/**
 * Ensures the uploads directory exists on startup.
 */
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  logger.info("Created uploads directory", { path: UPLOADS_DIR });
}

/**
 * Saves a file buffer to the local filesystem and returns its public URL.
 *
 * @param {Buffer} buffer    - The file content as a Buffer (from multer memoryStorage).
 * @param {string} filename  - The unique filename to save as (e.g. "3_uuid.jpg").
 * @returns {Promise<string>} The publicly accessible URL of the saved file.
 *
 * @example
 * const url = await uploadToFTP(req.file.buffer, "user_3_photo.jpg");
 * // → "http://dynamicsroute.tech/uploads/user_3_photo.jpg"
 */
async function uploadToFTP(buffer, filename) {
  // Defensive Check: Ensure the uploads directory exists before writing
  if (!fs.existsSync(UPLOADS_DIR)) {
    await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
    logger.info("Re-created missing uploads directory", { path: UPLOADS_DIR });
  }

  const filePath = path.join(UPLOADS_DIR, filename);

  await fs.promises.writeFile(filePath, buffer);

  const baseUrl = Config.APP_API_URL;
  const publicUrl = `${baseUrl}/uploads/${filename}`;

  logger.info("File saved locally", { filePath, publicUrl });
  return publicUrl;
}

/**
 * Deletes a file from the local filesystem.
 *
 * @param {string} filename - The filename to delete (just the basename, not full path).
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function deleteFromFTP(filename) {
  const basename = path.basename(filename); // safety: strip any path traversal
  const filePath = path.join(UPLOADS_DIR, basename);

  try {
    await fs.promises.unlink(filePath);
    logger.info("File deleted locally", { filePath });
    return { success: true, message: "File deleted successfully" };
  } catch (error) {
    if (error.code === "ENOENT") {
      logger.debug("File does not exist on disk, skipping delete", {
        filePath,
      });
      return { success: true, message: "File already does not exist" };
    }
    throw new Error(`Local file deletion failed: ${error.message}`);
  }
}

module.exports = { uploadToFTP, deleteFromFTP };
