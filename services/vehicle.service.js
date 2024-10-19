const { v4: uuidv4 } = require("uuid");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const currentDate = require("../Utils/currentDate");

const createVehicle = async (body) => {
  try {
    const { vehicleTypeUniqueId, licensePlate, userUniqueId } = body;

    if (!licensePlate || !vehicleTypeUniqueId) {
      return {
        message: "error",
        data: "All fields (vehicleTypeUniqueId, licensePlate, vehicleStatus) are required",
      };
    }

    let vehicleUniqueId = uuidv4();

    // Verify if vehicle already exists
    const vehicle = await getData({
      tableName: "Vehicle",
      conditions: { licensePlate },
    });
    if (vehicle.length == 0) {
      // Insert new vehicle
      const result = await insertData({
        tableName: "Vehicle",
        colAndVal: {
          vehicleUniqueId,
          vehicleTypeUniqueId,
          licensePlate,
        },
      });
    } else vehicleUniqueId = vehicle[0].vehicleUniqueId;
    // verify if the owner already have this vechle.
    const relation = await performJoinSelect({
      baseTable: "VehicleOwnership",
      joins: [
        {
          table: "Users",
          on: "VehicleOwnership.userUniqueId = Users.userUniqueId",
        },
        {
          table: "Vehicle",
          on: "VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId",
        },
      ],
      conditions: {
        "VehicleOwnership.userUniqueId": userUniqueId,
        licensePlate,
      },
    });
    // create ownership
    if (relation?.length > 0)
      return { message: "error", data: "User already have this vehicle" };
    const ownershipUniqueId = uuidv4();

    const result = await insertData({
      tableName: "VehicleOwnership",
      colAndVal: {
        ownershipUniqueId,
        vehicleUniqueId,
        userUniqueId,
        roleId: 1,
        ownershipStartDate: currentDate(),
      },
    });

    await insertData({
      tableName: "VehicleStatus",
      colAndVal: {
        vehicleStatusUniqueId: uuidv4(),
        vehicleUniqueId,
        statusTypeId: 1,
        statusStartDate: currentDate(),
      },
    });
    if (result.affectedRows > 0) {
      return { message: "success", data: "Vehicle created successfully" };
    }

    return { message: "error", data: "Vehicle creation failed" };
  } catch (error) {
    console.error("Error creating vehicle:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle creation",
    };
  }
};

const getVehicle = async (vehicleUniqueId) => {
  if (!vehicleUniqueId) {
    return { message: "error", data: "Vehicle Unique ID is required" };
  }

  try {
    const result = await getData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
    });

    return result.length > 0
      ? result[0]
      : { message: "error", data: "Vehicle not found" };
  } catch (error) {
    console.error("Error fetching vehicle:", error);
    return {
      message: "error",
      data: "An error occurred while fetching vehicle",
    };
  }
};
const updateVehicle = async (vehicleUniqueId, body) => {
  const { vehicleType, licensePlate, vehicleStatus } = body;

  if (!vehicleUniqueId) {
    return { message: "error", data: "Vehicle Unique ID is required" };
  }

  if (!vehicleType && !licensePlate && !vehicleStatus) {
    return {
      message: "error",
      data: "At least one field (vehicleType, licensePlate, vehicleStatus) must be provided for update",
    };
  }

  try {
    const result = await updateData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
      updateValues: { vehicleType, licensePlate, vehicleStatus },
    });

    if (result.affectedRows > 0) {
      return { message: "success", data: "Vehicle updated successfully" };
    }

    return {
      message: "error",
      data: "Vehicle not found or no changes were made",
    };
  } catch (error) {
    console.error("Error updating vehicle:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle update",
    };
  }
};
const deleteVehicle = async (vehicleUniqueId) => {
  if (!vehicleUniqueId) {
    return { message: "error", data: "Vehicle Unique ID is required" };
  }

  try {
    const result = await deleteData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
    });

    if (result.affectedRows > 0) {
      return { message: "success", data: "Vehicle deleted successfully" };
    }

    return { message: "error", data: "Vehicle not found" };
  } catch (error) {
    console.error("Error deleting vehicle:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle deletion",
    };
  }
};

const getAllVehicles = async () => {
  try {
    const result = await getData({ tableName: "Vehicle" });

    if (result.length > 0) {
      return result;
    }

    return { message: "error", data: "No vehicles found" };
  } catch (error) {
    console.error("Error fetching vehicles:", error);
    return {
      message: "error",
      data: "An error occurred while fetching vehicles",
    };
  }
};

module.exports = {
  createVehicle,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  getAllVehicles,
};
