const documentTypesService = require("../services/documentTypes.service");
const ServerResponder = require("../utils/ServerResponder");

const createDocumentType = async (req, res) => {
  try {
    // console.log("req.user ==========> ", req.user.data.userUniqueId);
    // return;
    const result = await documentTypesService.createDocumentType({
      body: req.body,
      user: req.user,
    });
    return ServerResponder(res, result, 201);
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
    const user = req.user.data;
    req.body.user = user;
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
