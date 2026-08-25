/**
 * Image compression utility using sharp.
 *
 * Provides two functions:
 *  - compressBuffer(buffer, opts)  → compressed JPEG buffer (for multer file uploads)
 *  - compressBase64(dataUrl, opts) → compressed base64 data-URL string (for signatures)
 *
 * Both default to JPEG quality 70 and max 1200px on the longest side — more than
 * enough for proof-of-delivery photos and signature canvases while keeping file
 * sizes under 200 KB in most cases.
 */

const sharp = require("sharp");

const DEFAULTS = {
  quality: 70,        // JPEG quality (1-100)
  maxWidth: 1200,     // longest dimension in pixels
  maxHeight: 1200,
};

/**
 * Compress an image buffer (e.g. from multer memoryStorage).
 * Returns a JPEG buffer. PDF/SVG files are passed through unchanged.
 *
 * @param {Buffer} buffer - Raw image bytes.
 * @param {Object} [opts] - Override defaults (quality, maxWidth, maxHeight).
 * @returns {Promise<Buffer>} Compressed JPEG buffer.
 */
const compressBuffer = async (buffer, opts = {}) => {
  const { quality, maxWidth, maxHeight } = { ...DEFAULTS, ...opts };

  // Detect if this is a PDF — don't try to compress PDFs
  if (buffer && buffer.length > 4 && buffer[0] === 0x25 && buffer[1] === 0x50) {
    // %P = PDF magic bytes
    return buffer;
  }

  try {
    const metadata = await sharp(buffer).metadata();

    // Skip compression if already small enough (< 100 KB) and already JPEG
    if (buffer.length < 100 * 1024 && metadata.format === "jpeg") {
      return buffer;
    }

    return await sharp(buffer)
      .rotate() // auto-rotate based on EXIF
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",      // never upscale
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true }) // mozjpeg for better compression
      .toBuffer();
  } catch (error) {
    // If sharp can't process it (unsupported format, corrupt file), return original
    const logger = require("./logger");
    logger.warn("Image compression failed, using original", {
      error: error.message,
    });
    return buffer;
  }
};

/**
 * Compress a base64 data-URL string (e.g. from react-native-signature-canvas).
 * Input format: "data:image/png;base64,iVBOR..."
 * Output format: "data:image/jpeg;base64,/9j/..."
 *
 * @param {string} dataUrl - Base64 data-URL string.
 * @param {Object} [opts] - Override defaults.
 * @returns {Promise<string>} Compressed base64 data-URL.
 */
const compressBase64 = async (dataUrl, opts = {}) => {
  if (!dataUrl || typeof dataUrl !== "string") {
    return dataUrl;
  }

  // Already small enough — skip processing
  if (dataUrl.length < 20 * 1024) {
    return dataUrl;
  }

  const { quality, maxWidth, maxHeight } = { ...DEFAULTS, ...opts };

  // Parse the data-URL: "data:image/png;base64,iVBOR..."
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) {
    // Not a data-URL — return as-is (might be a URL or other format)
    return dataUrl;
  }

  const inputMime = match[1];
  const base64Data = match[2];

  // If already JPEG and small, skip
  if (inputMime === "image/jpeg" && base64Data.length < 20 * 1024) {
    return dataUrl;
  }

  try {
    const inputBuffer = Buffer.from(base64Data, "base64");

    // Skip if already very small
    if (inputBuffer.length < 20 * 1024) {
      return dataUrl;
    }

    const outputBuffer = await sharp(inputBuffer)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    const compressedBase64 = outputBuffer.toString("base64");

    // Log compression ratio for monitoring
    const logger = require("./logger");
    const ratio = ((1 - outputBuffer.length / inputBuffer.length) * 100).toFixed(1);
    if (outputBuffer.length < inputBuffer.length) {
      logger.info("Signature compressed", {
        originalSize: inputBuffer.length,
        compressedSize: outputBuffer.length,
        reduction: `${ratio}%`,
      });
    }

    return `data:image/jpeg;base64,${compressedBase64}`;
  } catch (error) {
    const logger = require("./logger");
    logger.warn("Base64 compression failed, using original", {
      error: error.message,
    });
    return dataUrl;
  }
};

module.exports = { compressBuffer, compressBase64 };
