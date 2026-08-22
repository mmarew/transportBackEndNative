const path = require("path");
const { v4: uuidv4 } = require("uuid");
const deliveryConfirmationService = require("../Services/DeliveryConfirmation.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { uploadToFTP } = require("../Utils/FTPHandler");
const { compressBuffer } = require("../Utils/compressImage");

// Compress and upload a single proof-of-delivery photo, returning its stored path.
const saveDeliveryPhoto = async (file) => {
  if (!file?.buffer) {
    return null;
  }
  const compressed = await compressBuffer(file.buffer);
  const uniqueFilename = `delivery_${uuidv4()}.jpg`;
  return uploadToFTP(compressed, uniqueFilename);
};

// Collect every uploaded proof photo — req.files.photos[] plus the legacy single
// "photo" field (req.files.photo[0] or req.file) — and upload each. Returns the
// list of stored relative paths; the first entry is the primary/cover photo.
const saveDeliveryPhotos = async (req) => {
  const allFiles = [];
  if (req.file) {
    allFiles.push(req.file);
  }
  for (const group of Object.values(req.files || {})) {
    for (const file of group || []) {
      allFiles.push(file);
    }
  }
  const photoUrls = [];
  for (const file of allFiles) {
    const url = await saveDeliveryPhoto(file);
    if (url) {
      photoUrls.push(url);
    }
  }
  return photoUrls;
};

// Create a new delivery confirmation
exports.createDeliveryConfirmation = async (req, res, next) => {
  try {
    const {
      journeyUniqueId,
      receiverUserUniqueId,
      receiverPhoneNumber,
      receiverFullName,
      receiverEmail,
      deliveredQuantity,
      quantityUnit,
      condition,
      shipperSignature,
      notes,
      latitude,
      longitude,
      status,
    } = req.body;
    const createdBy = req.user.userUniqueId;
    const roleId = req.user.roleId;

    const photoUrls = await saveDeliveryPhotos(req);

    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.createDeliveryConfirmation({
        journeyUniqueId,
        receiverUserUniqueId,
        receiverPhoneNumber,
        receiverFullName,
        receiverEmail,
        createdBy,
        roleId,
        deliveredQuantity,
        quantityUnit,
        condition,
        shipperSignature,
        photoUrls,
        notes,
        latitude,
        longitude,
        status,
      });
    });
    // Best-effort push so the shipper can review & sign without polling.
    // Skipped when the shipper submitted & self-confirmed directly (they are the
    // creator; driver notified instead — inside the service) and when the record
    // already existed (idempotent create — don't re-notify on a retry).
    // Never fails the request — failures are logged inside the service.
    if (status !== "CONFIRMED" && !result?.isExisting) {
      await deliveryConfirmationService.notifyShipperOfPodSubmit(
        journeyUniqueId,
        result?.data?.deliveryConfirmationUniqueId,
      );
    }
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Get delivery confirmations by filters (id, journey, receiver, status) with pagination
exports.getDeliveryConfirmations = async (req, res, next) => {
  try {
    const {
      deliveryConfirmationUniqueId = "",
      journeyUniqueId = "",
      receiverUserUniqueId = "",
      status = "",
      page = 1,
      limit = 10,
    } = req.query;
    const result = await deliveryConfirmationService.getDeliveryConfirmations({
      deliveryConfirmationUniqueId,
      journeyUniqueId,
      receiverUserUniqueId,
      status,
      page: parseInt(page),
      limit: parseInt(limit),
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update a delivery confirmation by deliveryConfirmationUniqueId
exports.updateDeliveryConfirmation = async (req, res, next) => {
  try {
    const { deliveryConfirmationUniqueId } = req.params;
    const {
      status,
      deliveredQuantity,
      quantityUnit,
      condition,
      shipperSignature,
      statement,
      notes,
      latitude,
      longitude,
      otpCode,
    } = req.body;
    const updatedBy = req.user.userUniqueId;
    const roleId = req.user.roleId;

    const photoUrls = await saveDeliveryPhotos(req);

    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.updateDeliveryConfirmation(
        deliveryConfirmationUniqueId,
        {
          status,
          deliveredQuantity,
          quantityUnit,
          condition,
          shipperSignature,
          statement,
          photoUrls,
          notes,
          latitude,
          longitude,
          otpCode,
        },
        updatedBy,
        roleId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Tier A: request an OTP for the on-road receiver signature
exports.requestSignOtp = async (req, res, next) => {
  try {
    const { deliveryConfirmationUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.requestSignOtp(
        deliveryConfirmationUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete a delivery confirmation by deliveryConfirmationUniqueId
exports.deleteDeliveryConfirmation = async (req, res, next) => {
  try {
    const { deliveryConfirmationUniqueId } = req.params;
    const deletedBy = req.user.userUniqueId;
    const roleId = req.user.roleId;
    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.deleteDeliveryConfirmation(
        deliveryConfirmationUniqueId,
        deletedBy,
        roleId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Admin tool: recompute the settle hash and compare with the stored hash
exports.verifyDeliveryConfirmationHash = async (req, res, next) => {
  try {
    const { deliveryConfirmationUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.verifyDeliveryConfirmationHash(
        deliveryConfirmationUniqueId,
        req.user.roleId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/deliveryConfirmations/receipt
 *
 * Driver submits receipt photos for a receipt-required journey. The confirmation
 * is auto-confirmed immediately (source='RECEIPT_AUTO') — no shipper review.
 *
 * Expects multipart form-data with:
 * - `photos[]`: receipt image files (1–20, handled by multer)
 * - Body fields: `journeyUniqueId`, `notes`, `latitude`, `longitude`,
 *   `deliveredQuantity`, `quantityUnit`, `condition`
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next.
 */
exports.submitReceiptPhotos = async (req, res, next) => {
  try {
    const {
      journeyUniqueId,
      notes,
      latitude,
      longitude,
      deliveredQuantity,
      quantityUnit,
      condition,
    } = req.body;
    const driverUserUniqueId = req.user.userUniqueId;
    const driverRoleId = req.user.roleId;

    const photoUrls = await saveDeliveryPhotos(req);

    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.submitReceiptPhotos({
        journeyUniqueId,
        driverUserUniqueId,
        driverRoleId,
        photoUrls,
        notes,
        latitude,
        longitude,
        deliveredQuantity,
        quantityUnit,
        condition,
      });
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
