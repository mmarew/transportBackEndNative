const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/currentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const { createVehicleOwnership } = require("./VehicleOwnership.service");
const { createVehicleStatus } = require("./VehicleStatus.service");

const createVehicle = async (data, user) => {
  try {
    const { vehicleTypeUniqueId, licensePlate, color } = data;
    let vehicleUniqueId = uuidv4();

    if (!vehicleTypeUniqueId || !licensePlate || !color) {
      return { message: "error", error: "All fields are required" };
    }

    const vehicleTypeExists = await getData({
      tableName: "VehicleTypes",
      conditions: { vehicleTypeUniqueId },
    });

    if (!vehicleTypeExists.length) {
      return { message: "error", error: "Vehicle type does not exist" };
    }
    // verify if vehicle already exists with the same license plate
    const vehicleExists = await getData({
      tableName: "Vehicle",
      conditions: { licensePlate },
    });
    if (vehicleExists?.length == 0) {
      const vehicle = await insertData({
        tableName: "Vehicle",
        colAndVal: {
          vehicleUniqueId,
          vehicleTypeUniqueId,
          licensePlate,
          color,
          vehicleCreatedBy: user.userUniqueId,
          vehicleCreatedAt: currentDate(),
        },
      });
      // register vehicle status to be active
      const vehicleStatusData = { vehicleUniqueId, VehicleStatusTypeId: 1 };

      const vehicleStatusResult = await createVehicleStatus(vehicleStatusData);
      console.log("vehicleStatusResult", vehicleStatusResult);
    } else vehicleUniqueId = vehicleExists[0].vehicleUniqueId;
    // register vehicle ownership\
    const body = {
      vehicleUniqueId: vehicleUniqueId,
      userUniqueId: user.userUniqueId,
      roleId: 2,
      ownershipStartDate: currentDate(),
      ownershipEndDate: null,
    };
    const ownerShipResult = await createVehicleOwnership(body);
    console.log(" ownerShipResult ==========> ", ownerShipResult);
    if (ownerShipResult.message == "error")
      return { message: "error", error: "Failed to create vehicle ownership" };
    return { message: "success", data: "Vehicle created successfully" };
  } catch (error) {
    console.error("Error @createVehicle:", error);
    return { message: "error", error: "Failed to create vehicle" };
  }
};

const getVehicle = async (vehicleUniqueId) => {
  try {
    const result = await getData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
    });
    return result.length
      ? { message: "success", data: result[0] }
      : { message: "error", error: "Vehicle not found" };
  } catch (error) {
    console.error("Error @getVehicle:", error);
    return { message: "error", error: "Failed to get vehicle" };
  }
};

const updateVehicle = async (vehicleUniqueId, data, user) => {
  try {
    console.log(
      "vehicleUniqueId",
      vehicleUniqueId,
      " data ==============> ",
      data
    );
    const result = await updateData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
      updateValues: {
        ...data,
        vehicleUpdatedBy: user.userUniqueId,
        vehicleUpdatedAt: currentDate(),
      },
    });

    return result.affectedRows
      ? { message: "success", data: "Vehicle updated successfully" }
      : { message: "error", error: "Vehicle not found or no changes made" };
  } catch (error) {
    console.error("Error @updateVehicle:", error);
    return { message: "error", error: "Failed to update vehicle" };
  }
};

const deleteVehicle = async (vehicleUniqueId, user) => {
  try {
    const result = await updateData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
      updateValues: {
        vehicleDeletedBy: user.userUniqueId,
        vehicleDeletedAt: currentDate(),
      },
    });

    return result.affectedRows
      ? { message: "success", data: "Vehicle deleted successfully" }
      : { message: "error", error: "Vehicle not found" };
  } catch (error) {
    console.error("Error @deleteVehicle:", error);
    return { message: "error", error: "Failed to delete vehicle" };
  }
};

const getAllVehicles = async () => {
  try {
    const result = await getData({ tableName: "Vehicle" });
    return result.length
      ? { message: "success", data: result }
      : { message: "error", error: "No vehicles found" };
  } catch (error) {
    console.error("Error @getAllVehicles:", error);
    return { message: "error", error: "Failed to fetch vehicles" };
  }
};

const verifyUsersVehicle = async (ownerUserUniqueId, user) => {
  try {
    const result = await getData({
      tableName: "Vehicle",
      conditions: { vehicleCreatedBy: ownerUserUniqueId || user.userUniqueId },
    });
    return result.length
      ? { message: "success", data: result }
      : { message: "error", error: "No vehicles found" };
  } catch (error) {
    console.error("Error @verifyUsersVehicle:", error);
    return { message: "error", error: "Failed to verify vehicle" };
  }
};

module.exports = {
  createVehicle,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  getAllVehicles,
  verifyUsersVehicle,
};
