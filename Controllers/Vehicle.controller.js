const {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicles,
} = require("../Services/Vehicle.service");
const ServerResponder = require("../Utils/ServerResponder");
const { usersRoles } = require("../Utils/ListOfSeedData");
const AppError = require("../Utils/AppError");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const { assignVehicle } = require("../Services/CompanyVehicle.service");
const { currentDate } = require("../Utils/CurrentDate");

const createVehicleController = async (req, res, next) => {
  try {
    let driverUserUniqueId = req?.params?.driverUserUniqueId;
    const user = req?.user;
    const roleId = user?.roleId;
    if (driverUserUniqueId === "self" || !driverUserUniqueId) {
      driverUserUniqueId = req?.user?.userUniqueId;
    }

    if (
      roleId === usersRoles.adminRoleId ||
      roleId === usersRoles.supperAdminRoleId
    ) {
      // Admin or super admin can create   Vehicle for any driver
    } else if (roleId === usersRoles.driverRoleId) {
      if (driverUserUniqueId !== req?.user?.userUniqueId) {
        return next(
          new AppError("You can't register vehicle for another driver", 403),
        );
      }
    }

    const response = await executeInTransaction(async () => {
      // 1. Create the primary vehicle record and its initial ownership/driver association
      const vehicleResponse = await createVehicle(req.body, user, driverUserUniqueId);
      
      const { vehicleUniqueId } = vehicleResponse.data;
      const companyUniqueId = req?.body?.companyUniqueId;

      /**
       * AUTOMATED FLEET ASSIGNMENT:
       * If a companyUniqueId is provided in the request body, we automatically
       * link this new vehicle to the specified transport company's fleet.
       * This reduces the need for a second manual 'assign-to-fleet' call.
       */
      if (companyUniqueId) {
        await assignVehicle({
          companyUniqueId,
          vehicleUniqueId,
          assignmentStartDate: currentDate(),
          createdByUserUniqueId: user?.userUniqueId,
        });
      }

      return vehicleResponse;
    }, { timeout: 90000 }); // 90s — createVehicle chains 5+ DB calls on remote server
    ServerResponder(res, response, 201);
  } catch (error) {
    next(error);
  }
};

const updateVehicleController = async (req, res, next) => {
  try {
    const { vehicleUniqueId } = req.params;
    const response = await executeInTransaction(async () => {
      return await updateVehicle(vehicleUniqueId, req.body, req.user);
    });
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const deleteVehicleController = async (req, res, next) => {
  try {
    const { vehicleUniqueId } = req.params;
    const response = await executeInTransaction(async () => {
      return await deleteVehicle(vehicleUniqueId, req.user);
    });
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

const getVehiclesController = async (req, res, next) => {
  try {
    let ownerUserUniqueId = req?.query?.ownerUserUniqueId;
    const user = req?.user;
    const roleId = user?.roleId;

    if (
      roleId === usersRoles.adminRoleId ||
      roleId === usersRoles.supperAdminRoleId ||
      roleId === usersRoles.companyAdminRoleId
    ) {
      // Admin, super admin, or company admin can get vehicles for any user
      ownerUserUniqueId = undefined;
    } else if (ownerUserUniqueId === "self" || !ownerUserUniqueId) {
      ownerUserUniqueId = user?.userUniqueId;
    } else if (roleId === usersRoles.driverRoleId) {
      if (ownerUserUniqueId !== user?.userUniqueId) {
        return next(
          new AppError("You can't get vehicles for another driver", 403),
        );
      }
    }

    const response = await getVehicles({
      ...req.query,
      ownerUserUniqueId,
      user: user,
    });
    ServerResponder(res, response);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getVehiclesController,
};
