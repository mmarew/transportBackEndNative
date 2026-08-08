const { getData } = require("../CRUD/Read/ReadData");
const { currentDate } = require("../Utils/CurrentDate");
const AppError = require("../Utils/AppError");
const multer = require("multer");
const logger = require("../Utils/logger");
const { usersRolesList } = require("../Utils/ListOfSeedData");

const validateAndUpload = (req, res, next) => {
  // Create multer instance for parsing
  const storage = multer.memoryStorage();
  const upload = multer({ storage });

  // Parse multipart data
  upload.any()(req, res, async (err) => {
    if (err) {
      return next(new AppError("File upload parsing error", AppError.BAD_REQUEST));
    }

    try {
      // Now validate the parsed data
      const user = req?.user;
      let userUniqueId = req?.params?.userUniqueId;
      let roleId = usersRolesList.driver.roleId;

      if (userUniqueId === "self") {
        userUniqueId = user?.userUniqueId;
        roleId = user?.roleId;
      }

      const files = req?.files;
      if (!files || files.length === 0) {
        return next(new AppError("No files uploaded", AppError.BAD_REQUEST));
      }

      // Process each uploaded file for validation
      for (const file of files) {
        logger.debug("@validateDocumentUpload file", file);
        const expirationDateKey = `${file.fieldname}ExpirationDate`;
        const typeIdKey = `${file.fieldname}TypeId`;

        const documentExpirationDate = req.body[expirationDateKey] || null;
        const documentTypeId = req.body[typeIdKey];

        if (!documentTypeId) {
          return next(
            new AppError(
              `Document type ID is required for ${file.fieldname}`,
              400,
            ),
          );
        }

        // Check if document type exists and get requirements
        const conditions = {
          documentTypeId,
          roleId: roleId,
        };

        const documentType = await getData({
          tableName: "RoleDocumentRequirements",
          conditions,
        });

        if (documentType.length === 0) {
          return next(
            new AppError(
              `Role Document requirement not found for ${file.fieldname}`,
              400,
            ),
          );
        }

        const isExpirationDateRequired =
          documentType[0].isExpirationDateRequired;
        if (isExpirationDateRequired && !documentExpirationDate) {
          return next(
            new AppError(
              `Document expiration date is required for ${file.fieldname}`,
              400,
            ),
          );
        }

        // Check if document is expired
        if (documentExpirationDate) {
          const isExpired =
            new Date(documentExpirationDate) < new Date(currentDate());
          if (isExpired) {
            return next(
              new AppError(`Document is expired for ${file.fieldname}`, AppError.BAD_REQUEST),
            );
          }
        }

        // Check if the document already exists (only accepted ones block)
        const existingDocument = await getData({
          tableName: "AttachedDocuments",
          conditions: {
            userUniqueId,
            documentTypeId,
            // attachedDocumentAcceptance: "ACCEPTED",
          },
        });
        logger.debug("@existingDocument", existingDocument);
        if (existingDocument.length > 0) {
          return next(
            new AppError(
              `Document of this type is already uploaded for ${file.fieldname}`,
              409,
            ),
          );
        }
      }

      // All validations passed, proceed
      next();
    } catch {
      next(new AppError("Validation failed during document upload", AppError.INTERNAL_SERVER_ERROR));
    }
  });
};

module.exports = validateAndUpload;
