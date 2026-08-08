const AppError = require("../Utils/AppError");
const { getData } = require("../CRUD/Read/ReadData");
const ServerResponder = require("../Utils/ServerResponder");
const { HTTP_STATUS } = require("../Utils/Constants");

const toCamelCase = (str) => {
  return String(str)
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/(?:^\w|\b\w)/g, (match, index) =>
      index === 0 ? match.toLowerCase() : match.toUpperCase(),
    )
    .replace(/\s+/g, "");
};

const checkDocumentTypeExists = async (req, res, next) => {
  try {
    const documentTypeName = req?.body?.documentTypeName;

    if (!documentTypeName) {
      return next();
    }

    const camelCaseDocumentName = toCamelCase(documentTypeName);
    const uploadedDocumentName = camelCaseDocumentName;
    const uploadedDocumentTypeId = camelCaseDocumentName + "TypeId";

    const byName = await getData({
      tableName: "DocumentTypes",
      conditions: { documentTypeName },
    });

    if (byName?.length > 0) {
      return ServerResponder(res, byName[0], HTTP_STATUS.OK);
    }

    const byUploadedName = await getData({
      tableName: "DocumentTypes",
      conditions: { uploadedDocumentName },
    });

    if (byUploadedName?.length > 0) {
      return ServerResponder(res, byUploadedName[0], HTTP_STATUS.OK);
    }

    const byUploadedTypeId = await getData({
      tableName: "DocumentTypes",
      conditions: { uploadedDocumentTypeId },
    });

    if (byUploadedTypeId?.length > 0) {
      return ServerResponder(res, byUploadedTypeId[0], HTTP_STATUS.OK);
    }

    return next();
  } catch (error) {
    return next(
      new AppError(
        {
          message: "Unable to validate document type",
          code: "DOCUMENT_TYPE_CHECK_FAILED",
          details: { error: error?.message },
        },
        AppError.INTERNAL_SERVER_ERROR,
      ),
    );
  }
};

module.exports = checkDocumentTypeExists;
