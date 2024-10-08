// services/vehicleStatusType.service.js

const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");

// Create a new VehicleStatusType
const createVehicleStatusType = async (data) => {
  const redisteredType = await getData({
    tableName: "VehicleStatusType",
    conditions: { statusTypeName: data.statusTypeName },
  });
  if (redisteredType?.length) {
    return { message: "error", error: "VehicleStatusType already exists" };
  }
  const payload = {
    statusTypeName: data.statusTypeName,
    statusTypeDescription: data.statusTypeDescription,
    createdAt: new Date(),
  };
  const result = await insertData({
    tableName: "VehicleStatusType",
    colAndVal: payload,
  });
  return result;
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
    conditions: { statusTypeId: id },
  });
  return result;
};

// Update VehicleStatusType by ID
const updateVehicleStatusType = async (id, data) => {
  const payload = {
    statusTypeName: data.statusTypeName,
    statusTypeDescription: data.statusTypeDescription,
    deletedAt: data.deletedAt || null, // If you want to allow updating this field
  };
  const result = await updateData({
    tableName: "VehicleStatusType",
    conditions: { statusTypeId: id },
    updateValues: payload,
  });
  return result;
};

// Delete VehicleStatusType by ID
const deleteVehicleStatusType = async (id) => {
  const result = await deleteData({
    tableName: "VehicleStatusType",
    conditions: { statusTypeId: id },
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
