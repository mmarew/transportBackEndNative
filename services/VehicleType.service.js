// services/vehicleTypeService.js
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
// Create a new vehicle type
const createVehicleType = async (data, file) => {
  const vehicleTypeUniqueId = uuidv4();
  const user = data.user;
  const userUniqueId = user.userUniqueId;
  const {
    vehicleTypeName,
    vehicleTypeDescription,
    carryingCapacity,
    vehicleTypeIconName,
  } = data;

  const query = `
    INSERT INTO VehicleType (
      vehicleTypeUniqueId,
      vehicleTypeName,
      vehicleTypeIconName,
      vehicleTypeDescription,
      carryingCapacity,
      vehicleTypeCreatedBy,
      vehicleTypeCreatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, NOW())
  `;

  const values = [
    vehicleTypeUniqueId,
    vehicleTypeName,
    vehicleTypeIconName,
    vehicleTypeDescription,
    carryingCapacity,
    userUniqueId,
  ];

  try {
    await pool.query(query, values);
    return {
      message: "success",
      data: "Vehicle type created successfully",
    };
  } catch (error) {
    console.log("error", error?.code);
    if (error?.code === "ER_DUP_ENTRY") {
      return { message: "error", error: "Vehicle type already exists" };
    }
    return { message: "error", error: "unable to create vehicle type" };
  }
};

// Get all vehicle types
const getAllVehicleTypes = async () => {
  const query = `SELECT * FROM VehicleType WHERE vehicleTypeDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(query);
    return { message: "success", data: "Vehicle types fetched successfully" };
  } catch (error) {
    console.log(" error", error);
    return { message: "error", error: "unable to fetch vehicle types" };
  }
};

// Get a vehicle type by unique ID
const getVehicleTypeByUniqueId = async (vehicleTypeUniqueId) => {
  const query = `SELECT * FROM VehicleType WHERE vehicleTypeUniqueId = ? AND vehicleTypeDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(query, [vehicleTypeUniqueId]);
    return { message: "success", data: "Vehicle type fetched successfully" };
  } catch (error) {
    return { message: "error", error: "unable to fetch vehicle type" };
  }
};

// Update a vehicle type by unique ID
const updateVehicleType = async (vehicleTypeUniqueId, data, file) => {
  const {
    vehicleTypeName,
    vehicleTypeDescription,
    carryingCapacity,
    updatedBy,
  } = data;
  const vehicleTypeIconName = file ? file.filename : null;

  const query = `
    UPDATE VehicleType 
    SET 
      vehicleTypeName = ?, 
      vehicleTypeIconName = COALESCE(?, vehicleTypeIconName),
      vehicleTypeDescription = ?, 
      carryingCapacity = ?, 
      vehicleTypeUpdatedBy = ?, 
      vehicleTypeUpdatedAt = NOW() 
    WHERE vehicleTypeUniqueId = ? AND vehicleTypeDeletedAt IS NULL
  `;

  const values = [
    vehicleTypeName,
    vehicleTypeIconName,
    vehicleTypeDescription,
    carryingCapacity,
    updatedBy,
    vehicleTypeUniqueId,
  ];

  try {
    const [result] = await pool.query(query, values);
    return { message: "success", data: "Vehicle type updated successfully" };
  } catch (error) {
    return { message: "error", error: "unable to update vehicle type" };
  }
};

// Soft-delete a vehicle type by unique ID
const deleteVehicleType = async (vehicleTypeUniqueId, deletedBy) => {
  const query = `
    UPDATE VehicleType 
    SET 
      vehicleTypeDeletedAt = NOW(), 
      vehicleTypeDeletedBy = ? 
    WHERE vehicleTypeUniqueId = ? AND vehicleTypeDeletedAt IS NULL
  `;

  try {
    const [result] = await pool.query(query, [deletedBy, vehicleTypeUniqueId]);
    if (result.affectedRows === 0)
      return {
        message: "error",
        error: "Vehicle type not found or already deleted",
      };
    return { message: "Vehicle type deleted successfully" };
  } catch (error) {
    return { message: "error", error: "unable to delete vehicle type" };
  }
};

module.exports = {
  createVehicleType,
  getAllVehicleTypes,
  getVehicleTypeByUniqueId,
  updateVehicleType,
  deleteVehicleType,
};
