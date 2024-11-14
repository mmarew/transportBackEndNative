const { v4: uuidv4 } = require("uuid");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const currentDate = require("../Utils/currentDate");

const createVehicle = async (body) => {
  try {
    const { vehicleTypeUniqueId, licensePlate, color, user } = body; // Added 'color'
    const userUniqueId = user?.userUniqueId;

    // Validate required fields
    if (!licensePlate || !vehicleTypeUniqueId || !color) {
      return {
        message: "error",
        data: "All fields (vehicleTypeUniqueId, licensePlate, color) are required",
      };
    }

    // Check if the vehicle type exists
    const vehicleType = await getData({
      tableName: "VehicleTypes",
      conditions: { vehicleTypeUniqueId },
    });
    if (vehicleType.length === 0) {
      return { message: "error", error: "Vehicle type not found" };
    }

    // Check if the vehicle already exists by license plate
    const existingVehicle = await getData({
      tableName: "Vehicle",
      conditions: { licensePlate },
    });

    let vehicleUniqueId =
      existingVehicle.length > 0
        ? existingVehicle[0].vehicleUniqueId
        : uuidv4();

    // Handle existing vehicle
    if (existingVehicle.length > 0) {
      // Check if the vehicle is already owned by a user
      const vehicleOwnership = await getData({
        tableName: "VehicleOwnership",
        conditions: { vehicleUniqueId },
      });

      if (vehicleOwnership.length > 0) {
        const ownerUserUniqueId = vehicleOwnership[0].userUniqueId;
        if (ownerUserUniqueId !== userUniqueId) {
          return {
            message: "error",
            data: "This vehicle is already owned by another user",
          };
        } else {
          return {
            message: "success",
            data: "This vehicle is already owned by this user",
          };
        }
      }
    }

    // If the vehicle does not exist, proceed to create the vehicle record
    if (existingVehicle.length === 0) {
      await insertData({
        tableName: "Vehicle",
        colAndVal: {
          vehicleUniqueId,
          vehicleTypeUniqueId,
          licensePlate,
          color, // Add color field when creating a vehicle
          vehicleCreatedBy: userUniqueId,
          vehicleCreatedAt: currentDate(),
        },
      });
    }

    // Create vehicle ownership record
    const ownershipUniqueId = uuidv4();
    const ownershipResult = await insertData({
      tableName: "VehicleOwnership",
      colAndVal: {
        ownershipUniqueId,
        vehicleUniqueId,
        userUniqueId,
        roleId: 2, // Assuming roleId 2 means the user is the driver
        ownershipStartDate: currentDate(),
      },
    });

    if (ownershipResult.affectedRows > 0) {
      return { message: "success", data: "Vehicle created successfully" };
    }

    return { message: "error", data: "Vehicle creation failed" };
  } catch (error) {
    console.log("Error creating vehicle:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle creation",
    };
  }
};
const verifyUsersVehicle = async (body) => {
  let { ownerUserUniqueId } = body;
  if (ownerUserUniqueId == "self") {
    ownerUserUniqueId = body.user.userUniqueId;
  }

  const result = await performJoinSelect({
    baseTable: "Vehicle",
    joins: [
      {
        table: "VehicleOwnership",
        on: "Vehicle.vehicleUniqueId = VehicleOwnership.vehicleUniqueId",
      },
      {
        table: "Users",
        on: "VehicleOwnership.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { "VehicleOwnership.userUniqueId": ownerUserUniqueId },
  });
  return result;
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
    console.log("Error fetching vehicle:", error);
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
    console.log("Error updating vehicle:", error);
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
    console.log("Error deleting vehicle:", error);
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
    console.log("Error fetching vehicles:", error);
    return {
      message: "error",
      data: "An error occurred while fetching vehicles",
    };
  }
};

module.exports = {
  verifyUsersVehicle,
  createVehicle,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  getAllVehicles,
};
