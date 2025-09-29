const delinquencyTypesService = require("../Services/DelinquencyTypes.service");
const ServerResponder = require("../Utils/ServerResponder");

const handleServiceResponse = async (serviceCall, res) => {
  try {
    const result = await serviceCall;
    ServerResponder(res, result);
  } catch (error) {
    console.error("Error:", error);
    ServerResponder(res, {
      message: "error",
      error: error.message || "Operation failed",
    });
  }
};

const createDelinquencyType = async (req, res) => {
  const user = req.user;
  const data = {
    ...req.body,
    createdBy: user.userUniqueId,
  };

  await handleServiceResponse(
    delinquencyTypesService.createDelinquencyType(data),
    res
  );
};

const getDelinquencyTypes = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const filters = { ...req.query };

  await handleServiceResponse(
    delinquencyTypesService.getDelinquencyTypes(filters),
    res
  );
};

const getDelinquencyTypeById = async (req, res) => {
  const { delinquencyTypeUniqueId } = req.params;

  await handleServiceResponse(
    delinquencyTypesService.getDelinquencyTypeById(delinquencyTypeUniqueId),
    res
  );
};

const updateDelinquencyType = async (req, res) => {
  const { delinquencyTypeUniqueId } = req.params;
  const data = req.body;

  await handleServiceResponse(
    delinquencyTypesService.updateDelinquencyType(
      delinquencyTypeUniqueId,
      data
    ),
    res
  );
};

const deleteDelinquencyType = async (req, res) => {
  const { delinquencyTypeUniqueId } = req.params;

  await handleServiceResponse(
    delinquencyTypesService.deleteDelinquencyType(delinquencyTypeUniqueId),
    res
  );
};

const getDelinquencyTypesByRole = async (req, res) => {
  const { roleUniqueId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  await handleServiceResponse(
    delinquencyTypesService.getDelinquencyTypesByRole(roleUniqueId, {
      page: parseInt(page),
      limit: parseInt(limit),
    }),
    res
  );
};

const toggleDelinquencyTypeActive = async (req, res) => {
  const { delinquencyTypeUniqueId } = req.params;

  await handleServiceResponse(
    delinquencyTypesService.toggleDelinquencyTypeActive(
      delinquencyTypeUniqueId
    ),
    res
  );
};

module.exports = {
  createDelinquencyType,
  getDelinquencyTypes,
  getDelinquencyTypeById,
  updateDelinquencyType,
  deleteDelinquencyType,
  getDelinquencyTypesByRole,
  toggleDelinquencyTypeActive,
};
