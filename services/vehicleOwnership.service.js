const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { performJoinSelect } = require("../CRUD/Read/ReadData");

const createVehicleOwnership = async (body) => {
  const {
    vehicleUniqueId,
    userUniqueId,
    roleId,
    ownershipStartDate,
    ownershipEndDate,
  } = body;
  const ownershipUniqueId = uuidv4();
  // verify if vehice status is active
  const sql = `INSERT INTO VehicleOwnership (ownershipUniqueId, vehicleUniqueId, userUniqueId, roleId, ownershipStartDate, ownershipEndDate) 
               VALUES (?, ?, ?, ?, ?, ?)`;
  const values = [
    ownershipUniqueId,
    vehicleUniqueId,
    userUniqueId,
    roleId,
    ownershipStartDate,
    ownershipEndDate || null,
  ];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Vehicle ownership created successfully",
      };
    }
    return { message: "error", data: "Vehicle ownership creation failed" };
  } catch (error) {
    console.log("Error creating vehicle ownership:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle ownership creation",
    };
  }
};

const getVehicleOwnership = async (ownershipId) => {
  const sql = `SELECT * FROM VehicleOwnership WHERE ownershipId = ?`;
  try {
    const [result] = await pool.query(sql, [ownershipId]);
    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.log("Error fetching vehicle ownership:", error);
    throw error;
  }
};

const updateVehicleOwnership = async (ownershipId, body) => {
  const { vehicleId, userId, roleId, ownershipStartDate, ownershipEndDate } =
    body;
  const sql = `UPDATE VehicleOwnership SET vehicleId = ?, userId = ?, roleId = ?, ownershipStartDate = ?, ownershipEndDate = ? 
               WHERE ownershipId = ?`;
  const values = [
    vehicleId,
    userId,
    roleId,
    ownershipStartDate,
    ownershipEndDate || null,
    ownershipId,
  ];

  try {
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Vehicle ownership updated successfully",
      };
    }
    return { message: "error", data: "Vehicle ownership update failed" };
  } catch (error) {
    console.log("Error updating vehicle ownership:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle ownership update",
    };
  }
};

const deleteVehicleOwnership = async (ownershipId) => {
  const sql = `DELETE FROM VehicleOwnership WHERE ownershipId = ?`;

  try {
    const [result] = await pool.query(sql, [ownershipId]);
    if (result.affectedRows > 0) {
      return {
        message: "success",
        data: "Vehicle ownership deleted successfully",
      };
    }
    return { message: "error", data: "Vehicle ownership not found" };
  } catch (error) {
    console.log("Error deleting vehicle ownership:", error);
    return {
      message: "error",
      data: "An error occurred during vehicle ownership deletion",
    };
  }
};

const getAllVehicleOwnerships = async () => {
  const sql = `SELECT * FROM VehicleOwnership`;
  try {
    const [result] = await pool.query(sql);
    return result;
  } catch (error) {
    console.log("Error fetching vehicle ownerships:", error);
    throw error;
  }
};
const getVehicleOwnershipByUserUniqueId = async (userUniqueId) => {
  const vehicle = await performJoinSelect({
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
      {
        table: "VehicleTypes",
        on: "Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
      },
    ],
    conditions: { ["VehicleOwnership.userUniqueId"]: userUniqueId },
  });
  return vehicle;
};
module.exports = {
  getVehicleOwnershipByUserUniqueId,
  createVehicleOwnership,
  getVehicleOwnership,
  updateVehicleOwnership,
  deleteVehicleOwnership,
  getAllVehicleOwnerships,
};
