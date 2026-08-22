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
const { v4: uuidv4 } = require("uuid");
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

  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await fs.promises.writeFile(filePath, buffer);

  // Store only the relative path — the full URL is resolved at read time
  // via resolveDocumentUrl(). This means changing APP_API_URL automatically
  // fixes all existing documents without a DB migration.
  const relativePath = `/uploads/${filename}`;

  logger.info("File saved locally", { filePath, relativePath });
  return relativePath;
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
    // eslint-disable-next-line security/detect-non-literal-fs-filename
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

/**
 * Resolves a stored document path/URL to the current full public URL.
 *
 * Handles both formats:
 *   - New relative paths:  "/uploads/filename.png"
 *   - Legacy full URLs:    "https://old-domain.com/uploads/filename.png"
 *
 * Always returns: "{APP_API_URL}/uploads/filename.png"
 *
 * @param {string|null} storedPath - The value from AttachedDocuments.attachedDocumentName
 * @returns {string|null} The full public URL, or null if input is falsy.
 */
function resolveDocumentUrl(storedPath) {
  if (!storedPath) {return null;}

  const baseUrl = Config.APP_API_URL;

  // Already a relative path → just prepend base URL
  if (storedPath.startsWith("/uploads/")) {
    return `${baseUrl}${storedPath}`;
  }

  // Legacy full URL → extract the /uploads/... part and re-attach current base
  const uploadsIdx = storedPath.indexOf("/uploads/");
  if (uploadsIdx !== -1) {
    return `${baseUrl}${storedPath.slice(uploadsIdx)}`;
  }

  // Fallback: return as-is (external URL or unknown format)
  return storedPath;
}

/**
 * Upload a base64 data-URL string to the local uploads directory.
 *
 * Accepts:
 *   - data-URL:   "data:image/png;base64,iVBOR..."
 *   - raw base64: "iVBOR..." (treated as PNG)
 *   - null/undefined → returns null
 *
 * @param {string|null} dataUrl  - Base64-encoded image.
 * @param {string}      prefix   - Filename prefix (e.g. "sig_receiver").
 * @returns {Promise<string|null>} Relative path like "/uploads/sig_receiver_uuid.jpg" or null.
 */
async function uploadBase64ToFTP(dataUrl, prefix = "sig") {
  if (!dataUrl || typeof dataUrl !== "string") {
    return null;
  }

  // Parse data-URL or raw base64
  const match = dataUrl.match(/^data:[^;]+;base64,(.+)$/s);
  const base64 = match ? match[1] : dataUrl;

  try {
    const buffer = Buffer.from(base64, "base64");
    const filename = `${prefix}_${uuidv4()}.jpg`;
    return await uploadToFTP(buffer, filename);
  } catch (error) {
    logger.error("Failed to upload base64 to filesystem", {
      prefix,
      error: error.message,
    });
    return null;
  }
}

module.exports = { uploadToFTP, deleteFromFTP, resolveDocumentUrl, uploadBase64ToFTP };
