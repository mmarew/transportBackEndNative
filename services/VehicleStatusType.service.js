// services/vehicleStatusType.service.js

const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");

// Create a new VehicleStatusType
const createVehicleStatusType = async (data) => {
  const statusTypeName = data.VehicleStatusTypeName;
  if (statusTypeName.length > 50) {
    return { message: "error", error: "Vehicle Status Type name is too long" };
  }
  if (statusTypeName.length == 0) {
    return { message: "error", error: "Vehicle Status Type name is required" };
  }
  const redisteredType = await getData({
    tableName: "VehicleStatusType",
    conditions: { VehicleStatusTypeName: statusTypeName },
  });

  if (redisteredType?.length) {
    return { message: "error", error: "Vehicle Status Type already exists" };
  }
  // statusTypeName VARCHAR(50) NOT NULL,  -- Name of the vehicle status type
  // statusTypeDescription VARCHAR(255) NULL,  -- Description of the vehicle status type

  const payload = {
    VehicleStatusTypeName: data.VehicleStatusTypeName,
    VehicleStatusTypeDescription: data.statusTypeDescription,
    VehicleStatusTypeCreatedAt: new Date(),
  };
  const result = await insertData({
    tableName: "VehicleStatusType",
    colAndVal: payload,
  });
  return { message: "success", data: result };
};

// Get all VehicleStatusTypes
const getAllVehicleStatusTypes = async () => {
  const result = await getData({ tableName: "VehicleStatusType" });
  return result;
};

// Get a single VehicleStatusType by ID
const getVehicleStatusTypeById = async (id) => {
  const result = await getData({
    tableName: "VehicleStatusType",
    conditions: { VehicleStatusTypeId: id },
  });
  return result;
};

// Update VehicleStatusType by ID
const updateVehicleStatusType = async (id, data) => {
  const payload = {
    VehicleStatusTypeName: data.statusTypeName,
    VehicleStatusTypeDescription: data.statusTypeDescription,
    VehicleStatusTypeDeletedAt: data.deletedAt || null, // If you want to allow updating this field
  };
  const result = await updateData({
    tableName: "VehicleStatusType",
    conditions: { VehicleStatusTypeId: id },
    updateValues: payload,
  });
  return result;
};

// Delete VehicleStatusType by ID
const deleteVehicleStatusType = async (id) => {
  const result = await deleteData({
    tableName: "VehicleStatusType",
    conditions: { VehicleStatusTypeId: id },
  });
  return result;
};

module.exports = {
  createVehicleStatusType,
  getAllVehicleStatusTypes,
  getVehicleStatusTypeById,
  updateVehicleStatusType,
  deleteVehicleStatusType,
};
