const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");

const createVehicleStatus = async (data) => {
  // Check for duplicate VehicleStatus
  const existingStatus = await getData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusUniqueId: data.vehicleStatusUniqueId },
  });
  if (existingStatus?.length) {
    return { message: "error", error: "VehicleStatus already exists" };
  }

  // Prepare payload for insertion
  const payload = {
    vehicleStatusUniqueId: data.vehicleStatusUniqueId,
    vehicleUniqueId: data.vehicleUniqueId,
    statusTypeId: data.statusTypeId,
    statusStartDate: data.statusStartDate,
    statusEndDate: data.statusEndDate || null,
  };

  // Insert the data
  const result = await insertData({
    tableName: "VehicleStatus",
    colAndVal: payload,
  });
  return { message: "success", data: result };
};

const getVehicleStatusById = async (id) => {
  const result = await getData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusId: id },
  });
  if (!result?.length) {
    return { message: "error", error: "VehicleStatus not found" };
  }
  return { message: "success", data: result[0] };
};

const updateVehicleStatus = async (id, data) => {
  // Prepare payload for update
  const payload = {
    vehicleStatusUniqueId: data.vehicleStatusUniqueId,
    vehicleUniqueId: data.vehicleUniqueId,
    statusTypeId: data.statusTypeId,
    statusStartDate: data.statusStartDate,
    statusEndDate: data.statusEndDate || null,
  };

  const result = await updateData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusId: id },
    colAndVal: payload,
  });

  return result
    ? { message: "success", data: result }
    : { message: "error", error: "Update failed" };
};

const deleteVehicleStatus = async (id) => {
  const result = await deleteData({
    tableName: "VehicleStatus",
    conditions: { vehicleStatusId: id },
  });
  return result
    ? { message: "success" }
    : { message: "error", error: "Delete failed" };
};

module.exports = {
  createVehicleStatus,
  getVehicleStatusById,
  updateVehicleStatus,
  deleteVehicleStatus,
};
