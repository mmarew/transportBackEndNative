const { getData } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const logger = require("../Utils/logger");

/**
 * Middleware to check if documents with the same documentTypeId already exist for the user
 * This runs AFTER upload.any() parses files into memory (fast operation)
 * but BEFORE FTP upload and database operations (expensive operations)
 * This prevents unnecessary file processing while still allowing multer to parse the stream
 */
const checkDuplicateDocuments = async (req, res, next) => {
  try {
    // Resolve userUniqueId from params (handle "self" case)
    let userUniqueId = req?.params?.userUniqueId;
    const user = req?.user;

    if (userUniqueId === "self") {
      if (!user?.userUniqueId) {
        return next(new AppError("User not authenticated", 401));
      }
      userUniqueId = user.userUniqueId;
    }

    // At this point, req.body should have form fields from multer
    // Extract all documentTypeId values from request body
    // Fields follow pattern: ${fieldname}TypeId (e.g., licenseTypeId, insuranceTypeId)
    const documentTypeIds = [];
    const fieldNameToTypeId = {};
    // Find all fields ending with "TypeId"
    Object.keys(req.body || {}).forEach((fieldName) => {
      //filterr out the fields that are  ending with "TypeId"
      if (fieldName.endsWith("TypeId")) {
        const documentTypeId = req.body[fieldName];
        if (documentTypeId) {
          // collect documentTypeIds from the request body
          documentTypeIds.push(documentTypeId);
          fieldNameToTypeId[fieldName] = documentTypeId;
        }
      }
    });
    // If no documentTypeIds found, proceed (validation will catch this later)
    if (documentTypeIds.length === 0) {
      return next();
    }

    // Query database to check for existing documents
    // Check each documentTypeId individually to identify which ones are duplicates
    const duplicateChecks = await Promise.all(
      documentTypeIds.map(async (documentTypeId) => {
        const existingDocs = await getData({
          tableName: "AttachedDocuments",
          conditions: {
            ownerType: "user",
            ownerUniqueId: userUniqueId,
            documentTypeId,
          },
        });
        logger.debug("@existingDocs", existingDocs);
        return {
          documentTypeId,
          exists: existingDocs.length > 0,
        };
      }),
    );

    // Find which document types are duplicates
    const duplicates = duplicateChecks.filter((check) => check?.exists);
    const duplicateDocumentTypeIds = new Set(
      duplicates.map((d) => d.documentTypeId),
    );

    // If duplicates found, filter them out from files and body, but allow new documents to proceed
    if (duplicates?.length > 0) {
      // Map back to field names for better error reporting
      const duplicateFieldNames = [];
      duplicates?.forEach((dup) => {
        Object.keys(fieldNameToTypeId)?.forEach((fieldName) => {
          if (fieldNameToTypeId?.[fieldName] === dup?.documentTypeId) {
            duplicateFieldNames.push(fieldName);
          }
        });
      });

      // Store duplicate info in request for controller to use in response
      req._duplicateDocuments = {
        duplicateTypes: duplicateFieldNames,
        documentTypeIds: duplicates.map((d) => d.documentTypeId),
      };

      // Filter out duplicate files from req.files
      if (req.files && Array.isArray(req.files)) {
        const files = req.files;
        const filteredFiles = [];
        const duplicateFiles = [];

        files.forEach((file) => {
          const typeIdKey = `${file.fieldname}TypeId`;
          const documentTypeId = req.body[typeIdKey];

          if (documentTypeId && duplicateDocumentTypeIds.has(documentTypeId)) {
            // This file is a duplicate, don't process it
            duplicateFiles.push({
              file: file.fieldname,
              status: "failed",
              reason: "Document of this type is already uploaded",
            });
          } else {
            // This file is new, allow it to proceed
            filteredFiles.push(file);
          }
        });

        // modify and replace req.files with only non-duplicate files
        req.files = filteredFiles;
        req._duplicateFiles = duplicateFiles;

        // If all files were duplicates, return error
        if (filteredFiles.length === 0) {
          return next(
            new AppError("All documents are already uploaded", 400, {
              duplicateTypes: duplicateFieldNames,
              documentTypeIds: duplicates.map((d) => d.documentTypeId),
            }),
          );
        }
      }
    }

    // Proceed with non-duplicate files (or all files if no duplicates)
    return next();
  } catch (error) {
    next(error);
  }
};

module.exports = checkDuplicateDocuments;
