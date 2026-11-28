const vehicleStatusService = require("../Services/VehicleStatus.service");
const ServerResponder = require("../Utils/ServerResponder");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { HTTP_STATUS } = require("../Utils/Constants");
const { VEHICLE_STATUS_TYPES } = require("../Utils/ListOfSeedData");
const { isManualHoldStatus } = require("../Services/VehicleStatus.service");
const logger = require("../Utils/logger");

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
        req.user,
      );
    });

    // Admin holds are sticky. When an admin explicitly clears one, re-evaluate
    // documents so the vehicle lands in the correct derived state. Also guard
    // a direct ACTIVE update: ACTIVE is only valid when mandatory vehicle docs
    // are accepted/unexpired and no hold exists.
    const previousTypeId = result?.data?.previousVehicleStatusTypeId;
    const currentTypeId = result?.data?.currentVehicleStatusTypeId;
    const previousHold = isManualHoldStatus(
      previousTypeId,
      result?.data?.previousStatusDescription,
    );
    const currentHold = isManualHoldStatus(
      currentTypeId,
      result?.data?.currentStatusDescription,
    );
    const clearedHold = previousHold && !currentHold;
    const forcedActive = Number(currentTypeId) === VEHICLE_STATUS_TYPES.ACTIVE;
    if (
      (clearedHold || forcedActive) &&
      result?.data?.vehicleUniqueId
    ) {
      setImmediate(async () => {
        try {
          await vehicleStatusService.recalculateVehicleStatus(
            result.data.vehicleUniqueId,
            {
              actorUserUniqueId: req.user?.userUniqueId,
              clearHold: true,
            },
          );
        } catch (error) {
          logger.error("Failed to recalculate vehicle status after admin update", {
            vehicleUniqueId: result.data.vehicleUniqueId,
            error: error.message,
          });
        }
      });
    }

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
