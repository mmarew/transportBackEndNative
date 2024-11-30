const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { performJoinSelect, getData } = require("../CRUD/Read/ReadData");
const {
  getStatusOfVehicleByVehicleUniqueId,
  createVehicleStatus,
} = require("./VehicleStatus.service");
const { insertData } = require("../CRUD/Create/CreateData");

const createVehicleOwnership = async (body) => {
  const {
    vehicleUniqueId,
    userUniqueId,
    roleId,
    ownershipStartDate,
    ownershipEndDate = null,
  } = body;

  if (!vehicleUniqueId || !userUniqueId || !roleId || !ownershipStartDate) {
    return {
      message: "error",
      error: "All fields are required for vehicle ownership",
    };
  }

  // Verify vehicle status
  const statusOfVehicle = await getStatusOfVehicleByVehicleUniqueId(
    vehicleUniqueId
  );

  if (statusOfVehicle.message === "error") return statusOfVehicle;
  console.log("@createVehicleOwnership statusOfVehicle", statusOfVehicle);
  const statusData = statusOfVehicle.data;
  // if there is no status of vehicle registered before create new active status
  if (!statusData) {
    // create new active status of vehicle
    const data = await createVehicleStatus({
      vehicleUniqueId,
      VehicleStatusTypeId: 1,
    });
  } else if (statusData.VehicleStatusTypeId !== 1) {
    return { message: "error", error: "Vehicle is not active" };
  }

  // Check if ownership already exists
  const existingOwnership = await getData({
    tableName: "VehicleOwnership",
    conditions: { vehicleUniqueId, userUniqueId },
  });

  if (existingOwnership.length) {
    return { message: "error", error: "Vehicle ownership already exists" };
  }

  // Create new ownership
  const ownershipUniqueId = uuidv4();
  const result = await insertData({
    tableName: "VehicleOwnership",
    colAndVal: {
      ownershipUniqueId,
      vehicleUniqueId,
      userUniqueId,
      roleId,
      ownershipStartDate,
      ownershipEndDate,
    },
  });

  return { message: "success", data: result };
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
const getVehicleAndOwnershipViaUserUniqueId = async (userUniqueId) => {
  const vehicle = await performJoinSelect({
    baseTable: "Vehicle",
    joins: [
      {
        table: "VehicleOwnership",
        on: "VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId",
      },
      {
        table: "VehicleTypes",
        on: "Vehicle.vehicleTypeUniqueId = VehicleTypes.vehicleTypeUniqueId",
      },
    ],
    conditions: {
      "VehicleOwnership.userUniqueId": userUniqueId,
    },
  });
  return { message: "success", data: vehicle };
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
  getVehicleAndOwnershipViaUserUniqueId,
  getVehicleOwnershipByUserUniqueId,
  createVehicleOwnership,
  getVehicleOwnership,
  updateVehicleOwnership,
  deleteVehicleOwnership,
  getAllVehicleOwnerships,
};
