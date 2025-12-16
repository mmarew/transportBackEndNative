const {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicles,
} = require("../Services/Vehicle.service");
const ServerResponder = require("../Utils/ServerResponder");

const createVehicleController = async (req, res) => {
  try {
    let driverUserUniqueId = req?.params?.driverUserUniqueId;
    const roleId = req?.user?.roleId;
    // vehicle should be created via admin super or admin or driver itself

    if (driverUserUniqueId == "self")
      driverUserUniqueId = req?.user?.userUniqueId;
    if (roleId == 3 || roleId == 6) {
    } else if (roleId == 2) {
      if (driverUserUniqueId != req?.user?.userUniqueId) {
        return ServerResponder(res, {
          message: "error",
          error: "You can't register vehicle ",
        });
      }
    }

    const response = await createVehicle(
      req.body,
      req.user,
      driverUserUniqueId
    );
    ServerResponder(res, response);
  } catch (error) {
    console.error("@createVehicleController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to create vehicle",
    });
  }
};

const updateVehicleController = async (req, res) => {
  try {
    const { vehicleUniqueId } = req.params;
    const response = await updateVehicle(vehicleUniqueId, req.body, req.user);
    ServerResponder(res, response);
  } catch (error) {
    console.error("@updateVehicleController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to update vehicle",
    });
  }
};

const deleteVehicleController = async (req, res) => {
  try {
    const { vehicleUniqueId } = req.params;
    const response = await deleteVehicle(vehicleUniqueId, req.user);
    ServerResponder(res, response);
  } catch (error) {
    console.error("@deleteVehicleController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to delete vehicle",
    });
  }
};

// unified GET with filters and pagination
const getVehiclesController = async (req, res) => {
  try {
    const {
      vehicleUniqueId,
      ownerUserUniqueId,
      licensePlate,
      color,
      vehicleTypeUniqueId,
      page,
      pageSize,
      orderBy,
      orderDirection,
    } = req.query;

    const response = await getVehicles({
      vehicleUniqueId,
      ownerUserUniqueId,
      licensePlate,
      color,
      vehicleTypeUniqueId,
      page,
      pageSize,
      orderBy,
      orderDirection,
      user: req.user,
    });
    ServerResponder(res, response);
  } catch (error) {
    console.error("@getVehiclesController error:", error);
    ServerResponder(res, {
      message: "error",
      error: "Failed to fetch vehicles",
    });
  }
};

module.exports = {
  createVehicleController,
  updateVehicleController,
  deleteVehicleController,
  getVehiclesController,
};
