const { v4: uuidv4 } = require("uuid");
const { insertData } = require("../CRUD/Create/CreateData");
const { getData } = require("../CRUD/Read/ReadData");

const createVehicleType = async (vehicleTypeData, userUniqueId) => {
  const VehicleType = await getData({
    tableName: "VehicleType",
    conditions: { vehicleTypeName: vehicleTypeData.vehicleTypeName },
  });
  if (VehicleType.length > 0) {
    return {
      message: "error",
      error: "Vehicle type already exists",
      data: VehicleType[0],
    };
  }
  const vehicleTypeUniqueId = uuidv4();
  const newVehicleType = {
    vehicleTypeUniqueId,
    vehicleTypeName: vehicleTypeData.vehicleTypeName,
    vehicleTypeCreatedBy: userUniqueId,
    carryingCapacity: vehicleTypeData.carryingCapacity,
    vehicleTypeCreatedAt: new Date(),
  };

  const result = await insertData({
    tableName: "VehicleType",
    colAndVal: newVehicleType,
  });

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: newVehicleType,
    };
  } else {
    throw new Error("Failed to create vehicle type");
  }
};

const getAllVehicleTypes = async () => {
  return await getData({
    tableName: "VehicleType",
    conditions: { vehicleTypeDeletedAt: null },
  });
};

const getVehicleTypeById = async (vehicleTypeId) => {
  const result = await getData({
    tableName: "VehicleType",
    conditions: { vehicleTypeId, vehicleTypeDeletedAt: null },
  });
  return result.length > 0 ? result[0] : null;
};

const updateVehicleType = async (vehicleTypeId, updateData, userUniqueId) => {
  const updateValues = {
    vehicleTypeName: updateData.vehicleTypeName,
    carryingCapacity: updateData.carryingCapacity,
    vehicleTypeUpdatedBy: userUniqueId,
    vehicleTypeUpdatedAt: new Date(),
  };

  const result = await updateData({
    tableName: "VehicleType",
    conditions: { vehicleTypeId },
    updateValues,
  });

  if (result.affectedRows > 0) {
    return { message: "Vehicle type updated successfully", data: updateValues };
  } else {
    throw new Error("Failed to update vehicle type");
  }
};

const deleteVehicleType = async (vehicleTypeId, userUniqueId) => {
  const result = await updateData({
    tableName: "VehicleType",
    conditions: { vehicleTypeId },
    updateValues: {
      vehicleTypeDeletedAt: new Date(),
      vehicleTypeDeletedBy: userUniqueId,
    },
  });

  if (result.affectedRows > 0) {
    return { message: "Vehicle type deleted successfully" };
  } else {
    throw new Error("Failed to delete vehicle type");
  }
};

module.exports = {
  createVehicleType,
  getAllVehicleTypes,
  getVehicleTypeById,
  updateVehicleType,
  deleteVehicleType,
};
