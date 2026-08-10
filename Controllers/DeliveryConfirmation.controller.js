const path = require("path");
const { v4: uuidv4 } = require("uuid");
const deliveryConfirmationService = require("../Services/DeliveryConfirmation.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { uploadToFTP } = require("../Utils/FTPHandler");

// Upload the optional proof-of-delivery photo and return its public URL.
const saveDeliveryPhoto = (file) => {
  if (!file?.buffer) {
    return null;
  }
  const fileExtension = path.extname(file.originalname || "");
  const uniqueFilename = `delivery_${uuidv4()}${fileExtension}`;
  return uploadToFTP(file.buffer, uniqueFilename);
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
      receiverSignature,
      notes,
      latitude,
      longitude,
    } = req.body;
    const createdBy = req.user.userUniqueId;

    const photoUrl = await saveDeliveryPhoto(req.file);

    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.createDeliveryConfirmation({
        journeyUniqueId,
        receiverUserUniqueId,
        receiverPhoneNumber,
        receiverFullName,
        receiverEmail,
        createdBy,
        deliveredQuantity,
        quantityUnit,
        condition,
        receiverSignature,
        photoUrl,
        notes,
        latitude,
        longitude,
      });
    });
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
      receiverSignature,
      notes,
      latitude,
      longitude,
    } = req.body;
    const updatedBy = req.user.userUniqueId;

    const photoUrl = await saveDeliveryPhoto(req.file);

    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.updateDeliveryConfirmation(
        deliveryConfirmationUniqueId,
        {
          status,
          deliveredQuantity,
          quantityUnit,
          condition,
          receiverSignature,
          photoUrl,
          notes,
          latitude,
          longitude,
        },
        updatedBy,
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
    const result = await executeInTransaction(async () => {
      return await deliveryConfirmationService.deleteDeliveryConfirmation(
        deliveryConfirmationUniqueId,
        deletedBy,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};
