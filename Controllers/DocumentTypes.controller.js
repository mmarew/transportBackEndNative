const documentTypesService = require("../Services/DocumentTypes.service");
const ServerResponder = require("../Utils/ServerResponder");
const createDocumentType = async (req, res) => {
  try {
    const user = req?.user;

    req.body.user = user;
    const response = await documentTypesService.createDocumentType({
      body: req.body,
    });
    return ServerResponder(res, response);
  } catch (error) {
    console.log("Error in createDocumentType:", error);
    return ServerResponder(res, "Failed to create document type", 500);
  }
};

const getAllDocumentTypes = async (req, res) => {
  try {
    const result = await documentTypesService.getAllDocumentTypes();
    return ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in getAllDocumentTypes:", error);
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
    console.log("Error in getDocumentTypeById:", error);
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
    console.log("Error in updateDocumentType:", error);
    return ServerResponder(res, "Failed to update document type", 500);
  }
};

const deleteDocumentType = async (req, res) => {
  try {
    console.log("@deleteDocumentType user", req.user);
    const user = req?.user,
      documentTypeUniqueId = req.params.documentTypeUniqueId;

    const result = await documentTypesService.deleteDocumentType({
      documentTypeUniqueId,
      user,
    });
    return ServerResponder(res, result, 200);
  } catch (error) {
    console.log("Error in deleteDocumentType:", error);
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
