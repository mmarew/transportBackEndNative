const vehicleStatusTypeService = require("../Services/VehicleStatusType.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

// Create a new VehicleStatusType
const createVehicleStatusType = async (req, res, next) => {
  try {
    const result = await executeInTransaction(async () => {
      return await vehicleStatusTypeService.createVehicleStatusType(
        req.body,
      );
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};

// Get all VehicleStatusTypes
const getAllVehicleStatusTypes = async (req, res, next) => {
  try {
    const filters = req.query || {};
    const result = await vehicleStatusTypeService.getAllVehicleStatusTypes(filters);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Update VehicleStatusType by UUID
const updateVehicleStatusType = async (req, res, next) => {
  try {
    const { vehicleStatusTypeUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await vehicleStatusTypeService.updateVehicleStatusType(
        vehicleStatusTypeUniqueId,
        req.body,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

// Delete VehicleStatusType by UUID
const deleteVehicleStatusType = async (req, res, next) => {
  try {
    const { vehicleStatusTypeUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await vehicleStatusTypeService.deleteVehicleStatusType(
        vehicleStatusTypeUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVehicleStatusType,
  getAllVehicleStatusTypes,
  updateVehicleStatusType,
  deleteVehicleStatusType,
};
