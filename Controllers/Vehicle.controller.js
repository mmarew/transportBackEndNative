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
const {
  HTTP_STATUS,
  VEHICLE_REGISTRATION,
} = require("../Utils/Constants");
const { assertCompanyAccess } = require("../Services/CompanyHelper.service");

const createVehicleController = async (req, res, next) => {
  try {
    const requestedTarget = req?.params?.driverUserUniqueId;
    const user = req?.user;
    const roleId = user?.roleId;
    const noDriverAssigned =
      requestedTarget === VEHICLE_REGISTRATION.NO_DRIVER;

    const isPlatformAdmin =
      roleId === usersRoles.adminRoleId ||
      roleId === usersRoles.supperAdminRoleId;
    const isCompanyAdmin = roleId === usersRoles.companyAdminRoleId;
    const isDriver = roleId === usersRoles.driverRoleId;

    // Explicit whitelist: any other role used to fall through and could
    // register vehicles for arbitrary user UUIDs.
    if (!isPlatformAdmin && !isCompanyAdmin && !isDriver) {
      return next(
        new AppError(
          "You are not allowed to register a vehicle",
          AppError.FORBIDDEN,
        ),
      );
    }

    let driverUserUniqueId = requestedTarget;
    if (!requestedTarget || requestedTarget === VEHICLE_REGISTRATION.SELF) {
      driverUserUniqueId = user?.userUniqueId;
    }

    if (
      isDriver &&
      !noDriverAssigned &&
      driverUserUniqueId !== user?.userUniqueId
    ) {
      return next(
        new AppError(
          "You can't register vehicle for another driver",
          AppError.FORBIDDEN,
        ),
      );
    }

    // "no-driver-is-assigned-yet" means the vehicle is registered on its own:
    // no VehicleDriver row and no driver ownership are created.
    if (noDriverAssigned) {
      driverUserUniqueId = null;
    }

    const companyUniqueId = req?.body?.companyUniqueId;

    if (companyUniqueId && isDriver) {
      return next(
        new AppError(
          "Drivers cannot register vehicles into a company fleet",
          AppError.FORBIDDEN,
        ),
      );
    }

    if (noDriverAssigned && isCompanyAdmin && !companyUniqueId) {
      return next(
        new AppError(
          "companyUniqueId is required to register a company vehicle without a driver",
          AppError.BAD_REQUEST,
        ),
      );
    }

    // Company admins may only register into a company they belong to.
    if (companyUniqueId && !isPlatformAdmin) {
      await assertCompanyAccess(user, companyUniqueId);
    }

    const response = await executeInTransaction(async () => {
      // 1. Create the vehicle (driver/ownership links are added only for the
      //    driver's first active vehicle, or when no driver is assigned)
      const vehicleResponse = await createVehicle(
        req.body,
        user,
        driverUserUniqueId,
        { vehicleOnly: noDriverAssigned },
      );

      const { vehicleUniqueId } = vehicleResponse.data;

      /**
       * AUTOMATED FLEET ASSIGNMENT:
       * If a companyUniqueId is provided in the request body, link this vehicle
       * to the company fleet in the same transaction. For a company admin's
       * unassigned vehicle this is what makes it a company vehicle.
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
    ServerResponder(res, response, HTTP_STATUS.CREATED);
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
          new AppError("You can't get vehicles for another driver", AppError.FORBIDDEN),
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
