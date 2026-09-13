"use strict";

const crypto = require("crypto");

const { pool } = require("../../Middleware/Database.config");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const { compressBase64 } = require("../../Utils/compressImage");
const { uploadBase64ToFTP } = require("../../Utils/FTPHandler");
const { ADMIN_ROLE_IDS, getStoredPhotoUrls } = require("./helpers");

// ── Helpers: tamper hash, OTP, statements ────────────────────────────────────

// Canonical hash input — exactly what the admin verification tool recomputes to
// detect tampering. `|`-separated, photo URLs sorted so order never matters.
const buildSignatureHashInput = (fields) => {
  const sortedPhotos = [...(fields.photoUrls || [])].sort();
  return [
    fields.journeyUniqueId,
    fields.driverSignature || "",
    fields.shipperSignature || "",
    sortedPhotos.join(","),
    fields.deliveredQuantity ?? "",
    fields.quantityUnit || "",
    fields.condition || "",
    fields.latitude ?? "",
    fields.longitude ?? "",
    fields.confirmedAt || "",
  ].join("|");
};

const sha256 = (input) => crypto.createHash("sha256").update(input).digest("hex");

/**
 * Compress a base64 signature and upload it to the filesystem.
 * Returns the relative path (e.g. "/uploads/sig_receiver_uuid.jpg").
 * If the input is already a path/URL, it is returned unchanged.
 */
const uploadSignature = async (dataUrl, prefix) => {
  if (!dataUrl) return null;
  // Already a path — skip upload
  if (typeof dataUrl === "string" && (dataUrl.startsWith("/uploads/") || dataUrl.startsWith("http"))) {
    return dataUrl;
  }
  const compressed = await compressBase64(dataUrl);
  return await uploadBase64ToFTP(compressed, prefix);
};

// Admin tool (docs §10): recompute the settle hash from the stored fields and
// compare with the stored hash. `legacy: true` marks rows settled before the
// hash feature existed (stored hash is NULL).
exports.verifyDeliveryConfirmationHash = async (
  deliveryConfirmationUniqueId,
  roleId,
) => {
  const executor = transactionStorage.getStore() || pool;
  if (!ADMIN_ROLE_IDS.has(Number(roleId))) {
    throw new AppError(
      "Only an admin can verify a delivery confirmation hash",
      AppError.FORBIDDEN,
    );
  }

  const [rows] = await executor.query(
    `SELECT * FROM DeliveryConfirmations
     WHERE deliveryConfirmationUniqueId = ? AND deliveryConfirmationDeletedAt IS NULL`,
    [deliveryConfirmationUniqueId],
  );
  const current = rows[0];
  if (!current) {
    throw new AppError("Delivery confirmation not found", AppError.NOT_FOUND);
  }

  if (!current.deliveryConfirmationSignatureHash) {
    return {
      message: "Delivery confirmation hash verification",
      data: {
        deliveryConfirmationUniqueId,
        valid: null,
        legacy: true,
        storedHash: null,
        computedHash: null,
      },
    };
  }

  const storedPhotos = await getStoredPhotoUrls(executor, deliveryConfirmationUniqueId);
  const computedHash = sha256(
    buildSignatureHashInput({
      journeyUniqueId: current.journeyUniqueId,
      driverSignature: current.deliveryConfirmationDriverSignature,
      shipperSignature: current.deliveryConfirmationShipperSignature,
      photoUrls: storedPhotos,
      deliveredQuantity: current.deliveryConfirmationDeliveredQuantity,
      quantityUnit: current.deliveryConfirmationQuantityUnit,
      condition: current.deliveryConfirmationCondition,
      latitude: current.deliveryConfirmationLatitude,
      longitude: current.deliveryConfirmationLongitude,
      confirmedAt: current.deliveryConfirmationConfirmedAt,
    }),
  );

  return {
    message: "Delivery confirmation hash verification",
    data: {
      deliveryConfirmationUniqueId,
      valid: computedHash === current.deliveryConfirmationSignatureHash,
      legacy: false,
      storedHash: current.deliveryConfirmationSignatureHash,
      computedHash,
    },
  };
};


module.exports.buildSignatureHashInput = buildSignatureHashInput;
module.exports.sha256 = sha256;
module.exports.uploadSignature = uploadSignature;
