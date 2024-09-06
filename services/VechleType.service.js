// services/vehicleTypeService.js

const { v4: uuidv4 } = require("uuid");
const { getData } = require("../CRUD/Read/ReadData");
const { pool } = require("../Middleware/Database.config");
const currentDate = require("../Utils/currentDate");

const registerVehicleType = async (body) => {
  const { vehicleTypeName, vehicleTypeDescription } = body;

  // Verify existence (you'll need to implement this function)
  const results = await getData({
    tableName: "VehicleType",
    conditions: { vehicleTypeName },
  });

  if (results) return { message: "error", data: "Vehicle type already exists" };

  const vehicleTypeUniqueId = uuidv4();
  const sql = `INSERT INTO VehicleType (vehicleTypeUniqueId, vehicleTypeName, vehicleTypeDescription, vehicleTypeCreatedAt) 
               VALUES (?, ?, ?, ${currentDate()})`;
  const values = [vehicleTypeUniqueId, vehicleTypeName, vehicleTypeDescription];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Vehicle type registered successfully",
      };
    }
    return { message: "error", data: "Vehicle type registration failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during registration" };
  }
};

const getVehicleType = async (id) => {
  const sql = `SELECT * FROM VehicleType WHERE vehicleTypeId = ? AND vehicleTypeDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(sql, [id]);
    if (rows.length > 0) {
      return { message: "success", data: rows[0] };
    }
    return { message: "error", data: "Vehicle type not found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the vehicle type",
    };
  }
};

const updateVehicleType = async (id, body) => {
  const { vehicleTypeName, vehicleTypeDescription } = body;
  const sql = `UPDATE VehicleType SET vehicleTypeName = ?, vehicleTypeDescription = ? WHERE vehicleTypeId = ? AND vehicleTypeDeletedAt IS NULL`;
  const values = [vehicleTypeName, vehicleTypeDescription, id];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Vehicle type updated successfully" };
    }
    return { message: "error", data: "Vehicle type update failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during the update" };
  }
};

const deleteVehicleType = async (id) => {
  const sql = `UPDATE VehicleType SET vehicleTypeDeletedAt =${currentDate()} WHERE vehicleTypeId = ?`;

  try {
    const [result] = await pool.query(sql, [id]);
    if (result.affectedRows > 0) {
      return { message: "success", data: "Vehicle type deleted successfully" };
    }
    return { message: "error", data: "Vehicle type deletion failed" };
  } catch (error) {
    console.error("Error:", error);
    return { message: "error", data: "An error occurred during the deletion" };
  }
};

const getAllVehicleTypes = async () => {
  const sql = `SELECT * FROM VehicleType WHERE vehicleTypeDeletedAt IS NULL`;

  try {
    const [rows] = await pool.query(sql);
    if (rows.length > 0) {
      return { message: "success", data: rows };
    }
    return { message: "error", data: "No vehicle types found" };
  } catch (error) {
    console.error("Error:", error);
    return {
      message: "error",
      data: "An error occurred while retrieving the vehicle types",
    };
  }
};

module.exports = {
  registerVehicleType,
  getVehicleType,
  updateVehicleType,
  deleteVehicleType,
  getAllVehicleTypes,
};
