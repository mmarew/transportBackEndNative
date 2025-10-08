const ServerResponder = require("../Utils/ServerResponder");
const {
  createVehicleDriver,
  getVehicleDrivers,
  updateVehicleDriverByUniqueId,
  deleteVehicleDriverByUniqueId,
} = require("../Services/VehicleDriver.service");

// POST /api/vehicleDriver
const createVehicleDriverController = async (req, res) => {
  try {
    const body = req.body || {};
    const result = await createVehicleDriver(body);
    return ServerResponder(res, result);
  } catch (error) {
    console.error("@createVehicleDriverController", error);
    return ServerResponder(
      res,
      { message: "error", error: "Unable to create vehicle-driver" },
      500
    );
  }
};

// GET /api/vehicleDriver
const getVehicleDriversController = async (req, res) => {
  try {
    const user = req?.user;
    console.log("@user", user);
    let query = req?.query;
    let driverUserUniqueId = query?.driverUserUniqueId;
    if (driverUserUniqueId == "self") {
      driverUserUniqueId = user?.userUniqueId;
      query.driverUserUniqueId = driverUserUniqueId;
    }

    const result = await getVehicleDrivers(query || {});
    return ServerResponder(res, result);
  } catch (error) {
    console.error("@getVehicleDriversController", error);
    return ServerResponder(
      res,
      { message: "error", error: "Unable to get vehicle-driver list" },
      500
    );
  }
};

// PUT /api/vehicleDriver/:vehicleDriverUniqueId
const updateVehicleDriverController = async (req, res) => {
  try {
    const vehicleDriverUniqueId =
      req.query.vehicleDriverUniqueId || req.params.vehicleDriverUniqueId;
    const result = await updateVehicleDriverByUniqueId(
      vehicleDriverUniqueId,
      req.body || {}
    );
    return ServerResponder(res, result);
  } catch (error) {
    console.error("@updateVehicleDriverController", error);
    return ServerResponder(
      res,
      { message: "error", error: "Unable to update vehicle-driver" },
      500
    );
  }
};

// DELETE /api/vehicleDriver/:vehicleDriverUniqueId
const deleteVehicleDriverController = async (req, res) => {
  try {
    const vehicleDriverUniqueId =
      req.query.vehicleDriverUniqueId || req.params.vehicleDriverUniqueId;
    const result = await deleteVehicleDriverByUniqueId(vehicleDriverUniqueId);
    return ServerResponder(res, result);
  } catch (error) {
    console.error("@deleteVehicleDriverController", error);
    return ServerResponder(
      res,
      { message: "error", error: "Unable to delete vehicle-driver" },
      500
    );
  }
};

module.exports = {
  createVehicleDriverController,
  getVehicleDriversController,
  updateVehicleDriverController,
  deleteVehicleDriverController,
};
