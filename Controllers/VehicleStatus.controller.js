const vehicleStatusService = require("../Services/VehicleStatus.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");

const createVehicleStatus = async (req, res, next) => {
  try {
    const vehicleStatusCreatedBy = req.user.userUniqueId;
    const result = await executeInTransaction(async () => {
      return await vehicleStatusService.createVehicleStatus({
        ...req.body,
        vehicleStatusCreatedBy,
      });
    });
    ServerResponder(res, result, HTTP_STATUS.CREATED);
  } catch (error) {
    next(error);
  }
};

const getVehicleStatuses = async (req, res, next) => {
  try {
    const filters = req.query || {};
    const result = await vehicleStatusService.getVehicleStatuses(filters);
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const updateVehicleStatus = async (req, res, next) => {
  try {
    const { vehicleStatusUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await vehicleStatusService.updateVehicleStatus(
        vehicleStatusUniqueId,
        req.body,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

const deleteVehicleStatus = async (req, res, next) => {
  try {
    const { vehicleStatusUniqueId } = req.params;
    const result = await executeInTransaction(async () => {
      return await vehicleStatusService.deleteVehicleStatus(
        vehicleStatusUniqueId,
      );
    });
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVehicleStatus,
  updateVehicleStatus,
  deleteVehicleStatus,
  getVehicleStatuses,
};
