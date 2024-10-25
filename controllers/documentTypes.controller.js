const documentTypesService = require("../services/documentTypes.service");
const ServerResponder = require("../utils/ServerResponder");
const listOfDocuments = require("../Utils/listOfFixedData").listOfDocuments;
const createDocumentType = async (req, res) => {
  try {
    const user = req?.body?.user;
    if (!Array.isArray(listOfDocuments) || listOfDocuments.length === 0) {
      return ServerResponder(res, "No documents provided", 400);
    }
    const results = [];
    const errors = [];
    for (const document of listOfDocuments) {
      try {
        const response = await documentTypesService.createDocumentType({
          body: { ...document, user },
        });
        results.push({ document, response });
      } catch (error) {
        console.error("Error processing document:", error);
        errors.push({ document, error: "Failed to process document" });
      }
    }

    if (errors.length > 0) {
      return ServerResponder(
        res,
        {
          message: "Some documents failed to process",
          processedDocuments: results,
          failedDocuments: errors,
        },
        207
      );
    }

    return ServerResponder(
      res,
      {
        message: "All documents processed successfully",
        data: results,
      },
      201
    );
  } catch (error) {
    console.error("Error in createDocumentType:", error);
    return ServerResponder(res, "Failed to create document type", 500);
  }
};

const getAllDocumentTypes = async (req, res) => {
  try {
    const result = await documentTypesService.getAllDocumentTypes();
    return ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in getAllDocumentTypes:", error);
    return ServerResponder(res, "Failed to retrieve document types", 500);
  }
};

const getDocumentTypeById = async (req, res) => {
  try {
    const result = await documentTypesService.getDocumentTypeById(
      req.params.id
    );
    return ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in getDocumentTypeById:", error);
    return ServerResponder(res, "Failed to retrieve document type", 500);
  }
};

const updateDocumentType = async (req, res) => {
  try {
    const user = req?.user;
    req.user = user;
    const result = await documentTypesService.updateDocumentType({
      documentTypeUniqueId: req.params.id,
      updateDataValues: req.body,
    });
    return ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in updateDocumentType:", error);
    return ServerResponder(res, "Failed to update document type", 500);
  }
};

const deleteDocumentType = async (req, res) => {
  try {
    const result = await documentTypesService.deleteDocumentType(req.params.id);
    return ServerResponder(res, result, 200);
  } catch (error) {
    console.error("Error in deleteDocumentType:", error);
    return ServerResponder(res, "Failed to delete document type", 500);
  }
};

module.exports = {
  createDocumentType,
  getAllDocumentTypes,
  getDocumentTypeById,
  updateDocumentType,
  deleteDocumentType,
};
