const { performJoinSelect } = require("../CRUD/Read/ReadData");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const attachedDocumentsService = require("../Services/AttachedDocuments.service");
const {
  driversDocumentVehicleRequirement,
  entityDocumentRequirement,
} = require("../Services/RoleDocumentRequirements.service");
const { sendSocketIONotificationToAdmin } = require("../Utils/Notifications");
const ServerResponder = require("../Utils/ServerResponder");
const { uploadToFTP } = require("../Utils/FTPHandler");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");
const { usersRolesList } = require("../Utils/ListOfSeedData");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");

// Single consolidated filter method for ALL document retrieval
// Single consolidated filter method for ALL document retrieval
const getAttachedDocumentsByFilter = async (req, res, next) => {
  try {
    const {
      attachedDocumentUniqueId, // Get single document by ID
      userUniqueId, // Filter by user unique ID
      documentTypeId, // Filter by document type ID
      email, // Filter by user email
      phoneNumber, // Filter by user phone number
      fullName, // Filter by user full name
      page = 1, // Pagination
      limit = 10, // Pagination limit
      sortBy = "attachedDocumentCreatedAt", // Sort field
      sortOrder = "DESC", // Sort direction
    } = req.query;

    const currentUser = req.user;

    // If specific document ID is provided, return only that document
    if (attachedDocumentUniqueId) {
      const result =
        await attachedDocumentsService.getAttachedDocumentByUniqueId(
          attachedDocumentUniqueId,
        );
      return ServerResponder(res, result);
    }

    // ── Resolve owner context ────────────────────────────────────────────────
    // ownerType is injected by the route middleware (company/vehicle routes).
    // Falls back to 'user' for the legacy /api/user/attachedDocuments route.
    const resolvedOwnerType = req.ownerType ?? "user";

    // ownerUniqueId: route-injected param takes priority (company/vehicle routes),
    // then explicit query param, then 'self' (logged-in user).
    let resolvedOwnerUniqueId =
      req.ownerUniqueIdParam ??   // set by route middleware
      userUniqueId;               // from query string (legacy/admin usage)

    if (!resolvedOwnerUniqueId || resolvedOwnerUniqueId === "self") {
      resolvedOwnerUniqueId = currentUser.userUniqueId;
    }

    // Build filter object
    const filter = {
      ownerType: resolvedOwnerType,
      ownerUniqueId: resolvedOwnerUniqueId,
    };

    // Add additional filters if provided
    if (documentTypeId && documentTypeId !== "all") {
      filter.documentTypeId = documentTypeId;
    }

    if (email && email !== "all") {
      filter.email = email;
    }

    if (phoneNumber && phoneNumber !== "all") {
      filter.phoneNumber = phoneNumber;
    }

    if (fullName && fullName !== "all") {
      filter.fullName = fullName;
    }

    // Calculate pagination
    const offset = (page - 1) * limit;

    // Get documents with filtering and pagination
    const result = await attachedDocumentsService.getAttachedDocumentsByFilter({
      filter,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
      sort: {
        by: sortBy,
        order: sortOrder,
      },
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Other controller methods remain the same...
const createAttachedDocuments = async (req, res, next) => {
  try {
    let userUniqueId = req?.params?.userUniqueId;
    let roleId = usersRolesList.driver.roleId;

    const user = req?.user;
    if (userUniqueId === "self") {
      userUniqueId = user?.userUniqueId;
      roleId = user?.roleId;
    }
    const files = req?.files;
    if (!files || files.length === 0) {
      return next(new AppError("No files uploaded", 400));
    }

    const uploadResults = [];
    const documentsToRegister = [];

    // Add duplicate files info to upload results if middleware detected any
    if (req._duplicateFiles && req._duplicateFiles.length > 0) {
      uploadResults.push(...req._duplicateFiles);
    }

    // Process each uploaded file
    for (const file of files) {
      const fieldname = file.fieldname;
      const expirationDateKey = `${fieldname}ExpirationDate`;
      const descriptionKey = `${fieldname}Description`;
      const typeIdKey = `${fieldname}TypeId`;
      const fileNumberKey = `${fieldname}FileNumber`;

      const documentExpirationDate = req.body[expirationDateKey] || null;
      const attachedDocumentDescription = req.body[descriptionKey] || null;
      const documentTypeId = req.body[typeIdKey];
      const attachedDocumentFileNumber = req.body[fileNumberKey];

      try {
        // Generate unique filename
        const fileExtension = path.extname(file?.originalname);
        const uniqueFilename = `${user?.userId}_${uuidv4()}${fileExtension}`;
        const fileBuffer = file?.buffer;
        // Upload to cPanel or other storage via FTP
        const fileUrl = await uploadToFTP(fileBuffer, uniqueFilename);
        // --- ADD THIS LINE TO CLEAR MEMORY FOR THIS FILE IMMEDIATELY ---
        file.buffer = null;
        documentsToRegister.push({
          fieldname: file.fieldname,
          user,
          attachedDocumentDescription,
          attachedDocumentName: fileUrl,
          documentTypeId,
          documentExpirationDate,
          attachedDocumentFileNumber,
          originalFileName: file?.originalname,
        });
      } catch (uploadError) {
        uploadResults.push({
          file: file.fieldname,
          status: "failed",
          reason: `Upload failed: ${uploadError.message}`,
        });
      }
    }

    const fileErrors = [];
    const fileSuccesses = [];

    // Save all documents to database within a transaction
    await executeInTransaction(async () => {
      for (const document of documentsToRegister) {
        try {
          await attachedDocumentsService.createAttachedDocument({
            ...document,
            roleId,
            ownerType: req.ownerType ?? "user",   // set by route middleware
            ownerUniqueId: userUniqueId,
            uploadedByUserId: user?.userUniqueId,
          });

          fileSuccesses.push(document.originalFileName);
          uploadResults.push({
            file: document.fieldname,
            status: "success",
          });
        } catch (error) {
          fileErrors.push(document.originalFileName);
          uploadResults.push({
            file: document.fieldname,
            status: "failed",
            reason: error.message,
          });
        }
      }
    });

    if (fileSuccesses.length > 0) {
      const resolvedOwnerType = req.ownerType ?? "user";
      const isDriver = resolvedOwnerType === "user" && roleId === usersRolesList.driver.roleId;

      if (isDriver) {
        // Driver: full doc + vehicle + subscription check → notify admin
        try {
          const userData = await performJoinSelect({
            baseTable: "Users",
            joins: [
              { table: "UserRole", on: "Users.userUniqueId = UserRole.userUniqueId" },
              { table: "UserRoleStatusCurrent", on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId" },
            ],
            conditions: {
              "Users.userUniqueId": userUniqueId,
              "UserRole.roleId": roleId,
            },
          });

          const documentAndVehicleOfDriver = await driversDocumentVehicleRequirement({
            ownerUserUniqueId: userUniqueId,
            user: userData[0],
          });

          sendSocketIONotificationToAdmin({ message: documentAndVehicleOfDriver });
        } catch (notificationError) {
          logger.warn("Driver admin notification failed after document upload", {
            reason: notificationError?.message,
            userUniqueId,
            roleId,
          });
        }
      } else {
        // Company, vehicle, or any non-driver entity:
        // Run the general entity document compliance check and notify admin.
        try {
          const complianceResult = await entityDocumentRequirement({
            ownerType: resolvedOwnerType,
            ownerUniqueId: userUniqueId,
          });

          sendSocketIONotificationToAdmin({
            message: {
              type: "entity_document_uploaded",
              ...complianceResult,
              uploadedFiles: fileSuccesses,
            },
          });
        } catch (notificationError) {
          logger.warn("Entity admin notification failed after document upload", {
            reason: notificationError?.message,
            ownerType: resolvedOwnerType,
            ownerUniqueId: userUniqueId,
          });
        }
      }
    }

    // Check if there were duplicate files that were skipped
    const hasDuplicates = req._duplicateFiles && req._duplicateFiles.length > 0;
    const duplicateCount = hasDuplicates ? req._duplicateFiles.length : 0;

    if (fileErrors.length > 0 && fileSuccesses.length > 0) {
      return ServerResponder(res, {
        message: "partial_success",
        data: hasDuplicates
          ? `Some documents uploaded successfully, ${duplicateCount} duplicate(s) skipped, and some failed`
          : "Some documents uploaded successfully, but some failed",
        details: uploadResults,
      });
    } else if (fileErrors.length > 0 && fileSuccesses.length === 0) {
      return next(
        new AppError(
          hasDuplicates
            ? `All new documents failed to upload. ${duplicateCount} duplicate(s) were skipped.`
            : "All documents failed to upload",
          500,
        ),
      );
    }

    ServerResponder(res, {
      message: hasDuplicates ? "partial_success" : "success",
      data: hasDuplicates
        ? `${fileSuccesses.length} document(s) uploaded successfully. ${duplicateCount} duplicate(s) skipped.`
        : "All documents uploaded successfully",
      details: uploadResults,
    });
  } catch (error) {
    next(error);
  }
};

const updateAttachedDocument = async (req, res, next) => {
  try {
    const { attachedDocumentUniqueId } = req.params;
    const user = req?.user;
    const roleId = user?.roleId;
    const files = req?.files || [];
    const file = files?.length > 0 ? files?.[0] : null;
    logger.debug("@updateAttachedDocument files", { files });
    let documentExpirationDate = null;
    let attachedDocumentDescription = null;
    let attachedDocumentFileNumber = null;
    logger.debug("@req.body", req.body);
    // return;
    let fileUrl = null;

    if (file) {
      const fieldname = file?.fieldname;
      const expirationDateKey = `${fieldname}ExpirationDate`;
      const descriptionKey = `${fieldname}Description`;
      const fileNumberKey = `${fieldname}FileNumber`;

      documentExpirationDate = req.body[expirationDateKey] || null;
      attachedDocumentDescription = req.body[descriptionKey] || null;
      attachedDocumentFileNumber = req.body[fileNumberKey];
      const fileExtension = path.extname(file.originalname);
      const uniqueFilename = `${user?.userId}_${uuidv4()}${fileExtension}`;
      fileUrl = await uploadToFTP(file.buffer, uniqueFilename);
    }

    const updatePayload = {
      attachedDocumentUniqueId,
      roleId,
      documentExpirationDate,
      attachedDocumentDescription,
      attachedDocumentFileNumber,
      attachedDocumentName: fileUrl,
    };

    const result = await executeInTransaction(async () => {
      return await attachedDocumentsService.updateAttachedDocument(
        updatePayload,
      );
    });

    if (result.message === "error") {
      return next(new AppError(result.error, 400));
    }

    ServerResponder(res, {
      message: "success",
      data: "Document updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

const deleteAttachedDocument = async (req, res, next) => {
  try {
    const { attachedDocumentUniqueId } = req.params;

    const result = await executeInTransaction(async () => {
      return await attachedDocumentsService.deleteAttachedDocument(
        attachedDocumentUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const acceptRejectAttachedDocuments = async (req, res, next) => {
  const user = req?.user;
  req.body.user = user;
  try {
    const result = await executeInTransaction(async () => {
      return await attachedDocumentsService.acceptRejectAttachedDocuments(
        req.body,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAttachedDocumentsByFilter, // Only this GET method
  acceptRejectAttachedDocuments,
  createAttachedDocuments,
  updateAttachedDocument,
  deleteAttachedDocument,
};
