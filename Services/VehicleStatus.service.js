const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/DeleteData");
const { getData } = require("../CRUD/Read/ReadData");
const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/CurrentDate");
const createVehicleStatus = async (data) => {
  const { vehicleUniqueId, VehicleStatusTypeId, statusEndDate = null } = data;
  if (!vehicleUniqueId || !VehicleStatusTypeId) {
    return {
      message: "error",
      error: "VehicleUniqueId and VehicleStatusTypeId are required",
    };
  }

  // Check if the status already exists
  const existingStatus = await getData({
    tableName: "VehicleStatus",
    conditions: { vehicleUniqueId },
  });

  if (existingStatus.length) {
    return { message: "error", error: "VehicleStatus already exists" };
  }

  const vehicleStatusUniqueId = uuidv4();

  // Insert new status
  const result = await insertData({
    tableName: "VehicleStatus",
    colAndVal: {
      vehicleStatusUniqueId,
      vehicleUniqueId,
      VehicleStatusTypeId,
      statusStartDate: currentDate(),
      statusEndDate,
    },
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
const getStatusOfVehicleByVehicleUniqueId = async (vehicleUniqueId) => {
  if (!vehicleUniqueId) {
    return { message: "error", error: "vehicleUniqueId is required" };
  }
  const result = await getData({
    tableName: "VehicleStatus",
    conditions: { vehicleUniqueId },
  });

  return { message: "success", data: result[0] };
};

module.exports = {
  getStatusOfVehicleByVehicleUniqueId,
  createVehicleStatus,
  getVehicleStatusById,
  updateVehicleStatus,
  deleteVehicleStatus,
};
