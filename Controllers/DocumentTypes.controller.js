const documentTypesService = require("../Services/DocumentTypes.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

const createDocumentType = async (req, res, next) => {
  try {
    const user = req?.user;

    req.body.user = user;
    const response = await executeInTransaction(async () => {
      return await documentTypesService.createDocumentType({
        body: req.body,
      });
    });
    return ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const getAllDocumentTypes = async (req, res, next) => {
  try {
    const result = await documentTypesService.getAllDocumentTypes(req.query);
    return ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const updateDocumentType = async (req, res, next) => {
  try {
    const user = req?.user;
    const result = await executeInTransaction(async () => {
      return await documentTypesService.updateDocumentType({
        documentTypeUniqueId: req.params.documentTypeUniqueId,
        updateDataValues: { ...req.body, user },
      });
    });
    return ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

const deleteDocumentType = async (req, res, next) => {
  try {
    const user = req?.user,
      documentTypeUniqueId = req.params.documentTypeUniqueId;

    const result = await executeInTransaction(async () => {
      return await documentTypesService.deleteDocumentType({
        documentTypeUniqueId,
        user,
      });
    });
    return ServerResponder(res, result, HTTP_STATUS.OK);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDocumentType,
  getAllDocumentTypes,
  updateDocumentType,
  deleteDocumentType,
};
