const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const { createVehicleOwnership } = require("./VehicleOwnership.service");
const { createVehicleStatus } = require("./VehicleStatus.service");
const { removeWhiteSpace } = require("../Validator/Validation");
const { createVehicleDriver } = require("./VehicleDriver.service");
const { usersRoles } = require("../Utils/ListOfFixedData");
const { pool } = require("../Middleware/Database.config");

// create vehicle and create ownership based on status of vehicle.
const createVehicle = async (data, user, ownerUserUniqueId) => {
  try {
    console.log("@createVehicle data", data);
    console.log("@createVehicle user", user);
    console.log("@createVehicle ownerUserUniqueId", ownerUserUniqueId);
    let userUniqueId = ownerUserUniqueId;
    if (ownerUserUniqueId == "self") {
      userUniqueId = user?.userUniqueId;
    }
    let { vehicleTypeUniqueId, licensePlate, color } = data;
    licensePlate = removeWhiteSpace(licensePlate);
    if (!vehicleTypeUniqueId || !licensePlate || !color) {
      return { message: "error", error: "All fields are required" };
    }

    // Verify if VehicleType exists
    const vehicleTypeExists = await getData({
      tableName: "VehicleTypes",
      conditions: { vehicleTypeUniqueId },
    });

    if (!vehicleTypeExists.length) {
      return { message: "error", error: "Vehicle type does not exist" };
    }

    // Check if vehicle with the same license plate exists
    let vehicle = await getData({
      tableName: "Vehicle",
      conditions: { licensePlate },
    });

    if (!vehicle.length) {
      // Vehicle doesn't exist, create it
      const vehicleUniqueId = uuidv4();
      await insertData({
        tableName: "Vehicle",
        colAndVal: {
          vehicleUniqueId,
          vehicleTypeUniqueId,
          licensePlate,
          color,
          vehicleCreatedBy: user.userUniqueId,
          vehicleCreatedAt: currentDate(),
        },
      });

      // Register vehicle status as Active (VehicleStatusTypeId = 1)
      await createVehicleStatus({
        vehicleUniqueId,
        VehicleStatusTypeId: 1,
      });

      vehicle = [{ vehicleUniqueId }]; // Mock structure for return
    }

    // Register vehicle ownership
    const ownershipResult = await createVehicleOwnership({
      vehicleUniqueId: vehicle[0].vehicleUniqueId,
      userUniqueId:
        ownerUserUniqueId == "self" ? userUniqueId : ownerUserUniqueId,
      roleId: usersRoles.vehicleOwnerRoleId,
      ownershipStartDate: currentDate(),
    });
    // create vehicle-driver relationship (owner as initial driver)
    const ownerId =
      ownerUserUniqueId == "self" ? userUniqueId : ownerUserUniqueId;
    const driverResult = await createVehicleDriver({
      vehicleUniqueId: vehicle[0].vehicleUniqueId,
      ownerUserUniqueId: ownerId,
      driverUserUniqueId: ownerId,
      assignmentStatus: "active",
      assignmentStartDate: currentDate(),
    });
    // Normalize messages for idempotent-friendly behavior
    const isOwnershipSuccess = ownershipResult?.message === "success";
    const isDriverSuccess = driverResult?.message === "success";
    const isOwnershipAlreadyExists =
      ownershipResult?.message === "error" &&
      /ownership already exists/i.test(String(ownershipResult?.error || ""));
    const isDriverAlreadyReserved =
      driverResult?.message === "error" &&
      /already reserved by you/i.test(String(driverResult?.error || ""));

    // Success conditions
    if (
      (isOwnershipSuccess && isDriverSuccess) ||
      (isOwnershipSuccess && isDriverAlreadyReserved) ||
      (isDriverSuccess && isOwnershipAlreadyExists) ||
      (isOwnershipAlreadyExists && isDriverAlreadyReserved)
    ) {
      return {
        message: "success",
        data: { ownershipResult, driverResult },
      };
    }

    // Otherwise return a detailed error for debugging/UX
    return {
      message: "error",
      error: "Failed to create or attach ownership/driver",
      details: { ownershipResult, driverResult },
    };
  } catch (error) {
    console.error("Error @createVehicle:", error);
    return { message: "error", error: "Failed to create vehicle" };
  }
};

const updateVehicle = async (vehicleUniqueId, data, user) => {
  try {
    const vehicleTypeUniqueId = data?.vehicleTypeUniqueId,
      licensePlate = data?.licensePlate,
      color = data?.color,
      vehicleRegistrationDocument = data?.vehicleRegistrationDocument;
    console.log("@vehicleRegistrationDocument", vehicleRegistrationDocument);
    const result = await updateData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
      updateValues: {
        color,
        licensePlate,
        vehicleTypeUniqueId,
        vehicleUpdatedBy: user.userUniqueId,
        vehicleUpdatedAt: currentDate(),
      },
    });
    const attachedDocumentAcceptance =
      vehicleRegistrationDocument?.attachedDocumentAcceptance;
    const attachedDocumentUniqueId =
      vehicleRegistrationDocument?.attachedDocumentUniqueId;
    // update attached documents acceptance to pending if it is accepted
    if (attachedDocumentAcceptance == "ACCEPTED") {
      const updatedDocs = await updateData({
        tableName: "AttachedDocuments",
        conditions: { attachedDocumentUniqueId },
        updateValues: { attachedDocumentAcceptance: "PENDING" },
      });
      console.log("@updatedDocs", updatedDocs);
    }
    return result?.affectedRows
      ? { message: "success", data: "Vehicle updated successfully" }
      : { message: "error", error: "Vehicle not found or no changes made" };
  } catch (error) {
    console.error("Error @updateVehicle:", error);
    return { message: "error", error: "Failed to update vehicle" };
  }
};

const deleteVehicle = async (vehicleUniqueId, user) => {
  try {
    const result = await updateData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
      updateValues: {
        vehicleDeletedBy: user.userUniqueId,
        vehicleDeletedAt: currentDate(),
      },
    });

    return result.affectedRows
      ? { message: "success", data: "Vehicle deleted successfully" }
      : { message: "error", error: "Vehicle not found" };
  } catch (error) {
    console.error("Error @deleteVehicle:", error);
    return { message: "error", error: "Failed to delete vehicle" };
  }
};

// unified vehicle fetching with filters and pagination
const getVehicles = async ({
  vehicleUniqueId,
  ownerUserUniqueId,
  licensePlate,
  color,
  vehicleTypeUniqueId,
  page = 1,
  pageSize = 10,
  orderBy = "vehicleCreatedAt",
  orderDirection = "DESC",
  user,
}) => {
  try {
    const conditions = {};
    if (vehicleUniqueId) conditions.vehicleUniqueId = vehicleUniqueId;
    if (licensePlate) conditions.licensePlate = removeWhiteSpace(licensePlate);
    if (color) conditions.color = color;
    if (vehicleTypeUniqueId) conditions.vehicleTypeUniqueId = vehicleTypeUniqueId;
    // filter by creator/owner (as used by verifyUsersVehicle)
    if (ownerUserUniqueId) {
      const creatorId = ownerUserUniqueId === "self" ? user?.userUniqueId : ownerUserUniqueId;
      conditions.vehicleCreatedBy = creatorId;
    }

    const limit = Number(pageSize) || 10;
    const pageNum = Number(page) || 1;
    const offset = (pageNum - 1) * limit;

    // fetch paged data
    const items = await getData({
      tableName: "Vehicle",
      conditions,
      orderBy,
      orderDirection,
      limit,
      offset,
    });

    // total count (efficient COUNT query)
    const whereKeys = Object.keys(conditions);
    const whereClause = whereKeys.length
      ? "WHERE " +
        whereKeys
          .map((col) => `${col} = ?`)
          .join(" AND ")
      : "";
    const values = Object.values(conditions);
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM Vehicle ${whereClause}`,
      values
    );
    const total = countRows?.[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
      message: "success",
      data: items,
      pagination: {
        page: pageNum,
        pageSize: limit,
        total,
        totalPages,
      },
    };
  } catch (error) {
    console.error("Error @getVehicles:", error);
    return { message: "error", error: "Failed to fetch vehicles" };
  }
};

module.exports = {
  createVehicle,
  updateVehicle,
  deleteVehicle,
  getVehicles,
};
