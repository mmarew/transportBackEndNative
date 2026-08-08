const { performJoinSelect } = require("../CRUD/Read/ReadData");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const attachedDocumentsService = require("../Services/AttachedDocuments");
const {
  driversDocumentVehicleRequirement,
  entityDocumentRequirement,
} = require("../Services/RoleDocumentRequirements");
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

      // ── Ownership guard for single-doc fetch ──────────────────────────────
      // Admins and SuperAdmins can see any document.
      // Everyone else can only see a document if they are the owner:
      //   ownerType='user'    → ownerUniqueId must match currentUser.userUniqueId
      //   ownerType='company' → currentUser must have an active CompanyMembership
      //   ownerType='vehicle' → currentUser must be actively assigned to the vehicle
      // If the document doesn't exist, just return the (empty) service result.
      const doc = result?.data;
      const isAdminOrSuper =
        currentUser.roleId === usersRolesList.admin.roleId ||
        currentUser.roleId === usersRolesList.supperAdmin.roleId;

      if (doc && !isAdminOrSuper) {
        const { pool: dbPool } = require("../Middleware/Database.config");
        let allowed = false;

        if (doc.ownerType === "user") {
          allowed = doc.ownerUniqueId === currentUser.userUniqueId;
        } else if (doc.ownerType === "company") {
          const [rows] = await dbPool.query(
            `SELECT membershipId FROM CompanyMembership
             WHERE userUniqueId = ? AND companyUniqueId = ?
               AND isActive = 1 AND membershipDeletedAt IS NULL LIMIT 1`,
            [currentUser.userUniqueId, doc.ownerUniqueId],
          );
          allowed = rows.length > 0;
        } else if (doc.ownerType === "vehicle") {
          const [rows] = await dbPool.query(
            `SELECT vehicleDriverId FROM VehicleDriver
             WHERE driverUserUniqueId = ? AND vehicleUniqueId = ?
               AND assignmentStatus = 'active' AND vehicleDriverDeletedAt IS NULL LIMIT 1`,
            [currentUser.userUniqueId, doc.ownerUniqueId],
          );
          allowed = rows.length > 0;
        }

        if (!allowed) {
          return next(new AppError("Forbidden: you do not own this document.", AppError.FORBIDDEN));
        }
      }

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
      return next(new AppError("No files uploaded", AppError.BAD_REQUEST));
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

    // ── Auto-resolve company ownership ──────────────────────────────────────────
    // When a company admin uploads via /self, the route sets ownerType='user'.
    // But company-level documents (logo, TIN, business license) must be stored
    // with ownerType='company' + companyUniqueId, not the user's UUID.
    //
    // Strategy: For each document, if the documentTypeId is mapped to the
    // company entity role (roleId=8) in RoleDocumentRequirements, look up the
    // user's active CompanyMembership and use the companyUniqueId.
    // This avoids requiring the frontend to know/pass the companyUniqueId.

    const { pool: dbPool } = require("../Middleware/Database.config");

    // Preload company membership once (not per file) to avoid duplicate queries
    let resolvedCompanyUniqueId = null;
    let companyDocTypeIds = new Set();          // populated below if ownerType='user'
    const routeOwnerType = req.ownerType ?? "user";

    if (routeOwnerType === "user") {
      // Fetch company document typeIds (roleId=8) in a single query
      const [companyDocTypes] = await dbPool.query(
        `SELECT documentTypeId FROM RoleDocumentRequirements WHERE roleId = 8 AND roleDocumentRequirementDeletedAt IS NULL`,
      );
      companyDocTypeIds = new Set(companyDocTypes.map((r) => String(r.documentTypeId)));

      // Check if ANY of the documents being uploaded is a company document
      const hasCompanyDoc = documentsToRegister.some((d) =>
        companyDocTypeIds.has(String(d.documentTypeId)),
      );

      if (hasCompanyDoc) {
        // Resolve the user's active company membership
        const [membershipRows] = await dbPool.query(
          `SELECT companyUniqueId FROM CompanyMembership
           WHERE userUniqueId = ? AND isActive = 1 AND membershipDeletedAt IS NULL
           LIMIT 1`,
          [userUniqueId],
        );
        resolvedCompanyUniqueId = membershipRows[0]?.companyUniqueId ?? null;

        if (!resolvedCompanyUniqueId) {
          logger.warn("User is uploading a company document but has no active CompanyMembership", {
            userUniqueId,
          });
        }
      }
    }

    // Save all documents to database within a transaction
    await executeInTransaction(async () => {
      for (const document of documentsToRegister) {
        try {
          // Per-document: check if THIS specific documentTypeId is a company document
          const isCompanyDoc =
            routeOwnerType === "user" &&
            companyDocTypeIds.has(String(document.documentTypeId));

          let finalOwnerType = routeOwnerType;
          let finalOwnerUniqueId = userUniqueId;

          if (isCompanyDoc) {
            if (resolvedCompanyUniqueId) {
              // Company document + membership found → save as company
              finalOwnerType = "company";
              finalOwnerUniqueId = resolvedCompanyUniqueId;
            } else {
              // Company document but user has no active membership
              // Log warning and fall back to user — admin must fix the membership
              logger.warn("Company document uploaded but no active membership found", {
                userUniqueId,
                documentTypeId: document.documentTypeId,
              });
            }
          }

          await attachedDocumentsService.createAttachedDocument({
            ...document,
            roleId,
            ownerType: finalOwnerType,
            ownerUniqueId: finalOwnerUniqueId,
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
      updatedByUserId: user?.userUniqueId,   // audit: who triggered this update
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
      return next(new AppError(result.error, AppError.BAD_REQUEST));
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

/**
 * GET /api/user/documentHistory
 * GET /api/company/documentHistory/:companyUniqueId
 * GET /api/vehicle/documentHistory/:vehicleUniqueId
 *
 * Optional query params:
 *   attachedDocumentUniqueId  → narrow history to one specific document
 *   page, limit, sortBy, sortOrder
 */
const getDocumentHistory = async (req, res, next) => {
  try {
    const {
      attachedDocumentUniqueId, // optional — narrow to a single doc's history
      page = 1,
      limit = 10,
      sortBy = "attachedDocumentUpdatedAt",
      sortOrder = "DESC",
    } = req.query;

    const currentUser = req.user;

    // ownerType is injected by the route inline middleware
    const ownerType = req.ownerType ?? "user";

    // ownerUniqueId: route param takes priority, then 'self' → current user
    let ownerUniqueId =
      req.ownerUniqueIdParam ??
      req.query?.userUniqueId ??
      currentUser.userUniqueId;

    if (!ownerUniqueId || ownerUniqueId === "self") {
      ownerUniqueId = currentUser.userUniqueId;
    }

    const offset = (Number(page) - 1) * Number(limit);

    const result = await attachedDocumentsService.getDocumentHistory({
      ownerType,
      ownerUniqueId,
      attachedDocumentUniqueId: attachedDocumentUniqueId || null,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        offset,
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


module.exports = {
  getAttachedDocumentsByFilter,
  acceptRejectAttachedDocuments,
  createAttachedDocuments,
  updateAttachedDocument,
  deleteAttachedDocument,
  getDocumentHistory,
};
