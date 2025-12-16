const { v4: uuidv4 } = require("uuid");
const { currentDate } = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const { createVehicleOwnership } = require("./VehicleOwnership.service");
const { createVehicleStatus } = require("./VehicleStatus.service");
const { removeWhiteSpace } = require("../Validator/Validation");
const {
  createVehicleDriver,
  getVehicleDrivers,
} = require("./VehicleDriver.service");
const { usersRoles } = require("../Utils/ListOfFixedData");
const { pool } = require("../Middleware/Database.config");

// create vehicle and create ownership based on status of vehicle.
const createVehicle = async (data, user, driverUserUniqueId) => {
  try {
    let userUniqueId = driverUserUniqueId;

    if (driverUserUniqueId == "self") {
      userUniqueId = user?.userUniqueId;
    }

    let vehicleTypeUniqueId = data?.vehicleTypeUniqueId,
      licensePlate = data?.licensePlate,
      color = data?.color,
      isDriverOwnerOfVehicle = data?.isDriverOwnerOfVehicle;

    licensePlate = removeWhiteSpace(licensePlate);
    if (!vehicleTypeUniqueId || !licensePlate || !color) {
      return { message: "error", error: "All fields are required" };
    }

    // Verify if VehicleType exists
    const vehicleTypeExists = await getData({
      tableName: "VehicleTypes",
      conditions: { vehicleTypeUniqueId },
    });
    console.log("@vehicleTypeExists", vehicleTypeExists);

    if (!vehicleTypeExists.length) {
      return { message: "error", error: "Vehicle type does not exist" };
    }

    // Check if vehicle with the same license plate exists
    let vehicle = await getData({
      tableName: "Vehicle",
      conditions: { licensePlate },
    });

    if (!vehicle?.length) {
      // Vehicle doesn't exist, create it
      const vehicleUniqueId = uuidv4();
      await insertData({
        tableName: "Vehicle",
        colAndVal: {
          vehicleUniqueId,
          vehicleTypeUniqueId,
          licensePlate,
          color,
          vehicleCreatedBy: user?.userUniqueId,
          vehicleCreatedAt: currentDate(),
        },
      });

      // Register vehicle status as Active (VehicleStatusTypeId = 1)
      await createVehicleStatus({
        vehicleUniqueId,
        VehicleStatusTypeId: 1,
      });

      vehicle = [{ vehicleUniqueId }];
      // Mock structure for return
    }

    // check if this user has active vehicle
    const activeVehicle = await getVehicleDrivers({
      driverUserUniqueId: user?.userUniqueId,
      assignmentStatus: "active",
    });
    console.log("@activeVehicle", activeVehicle);
    if (activeVehicle?.data?.length > 0) {
      return {
        message: "error",
        error: "driver already have vehicle",
      };
    }
    let ownershipResult = undefined;
    // Register vehicle ownership
    if (isDriverOwnerOfVehicle) {
      ownershipResult = await createVehicleOwnership({
        vehicleUniqueId: vehicle?.[0]?.vehicleUniqueId,
        userUniqueId,
        roleId: usersRoles?.vehicleOwnerRoleId,
        ownershipStartDate: currentDate(),
      });
    }
    // create vehicle-driver relationship (owner as initial driver)
    const ownerUserUniqueId =
      driverUserUniqueId == "self" ? userUniqueId : driverUserUniqueId;
    const driverResult = await createVehicleDriver({
      vehicleUniqueId: vehicle?.[0]?.vehicleUniqueId,
      ownerUserUniqueId: ownerUserUniqueId,
      driverUserUniqueId: ownerUserUniqueId,
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

// unified vehicle fetching with filters, pagination, and vehicle type data
const getVehicles = async ({
  vehicleUniqueId,
  ownerUserUniqueId,
  licensePlate,
  color,
  vehicleTypeUniqueId,
  page = 1,
  pageSize = 10,
  orderBy = "v.vehicleCreatedAt",
  orderDirection = "DESC",
  user,
}) => {
  try {
    const conditions = {};

    if (vehicleUniqueId) conditions["v.vehicleUniqueId"] = vehicleUniqueId;
    if (licensePlate)
      conditions["v.licensePlate"] = removeWhiteSpace(licensePlate);
    if (color) conditions["v.color"] = color;
    if (vehicleTypeUniqueId) {
      conditions["v.vehicleTypeUniqueId"] = vehicleTypeUniqueId;
    }

    // filter by creator/owner (as used by verifyUsersVehicle)
    if (ownerUserUniqueId) {
      const creatorId =
        ownerUserUniqueId === "self" ? user?.userUniqueId : ownerUserUniqueId;
      conditions["v.vehicleCreatedBy"] = creatorId;
    }

    const limit = Number(pageSize) || 10;
    const pageNum = Number(page) || 1;
    const offset = (pageNum - 1) * limit;

    // Build the base query with JOIN
    let baseQuery = `
      FROM Vehicle v
      INNER JOIN VehicleTypes vt ON v.vehicleTypeUniqueId = vt.vehicleTypeUniqueId
    `;

    const whereKeys = Object.keys(conditions);
    const whereClause = whereKeys?.length
      ? "WHERE " + whereKeys.map((col) => `${col} = ?`).join(" AND ")
      : "";

    const values = Object.values(conditions);

    // Select all vehicle fields plus vehicle type information
    const selectFields = `
      v.*,
      vt.vehicleTypeName,
      vt.vehicleTypeIconName,
      vt.vehicleTypeDescription,
      vt.carryingCapacity,
      vt.vehicleTypeCreatedAt as typeCreatedAt,
      vt.vehicleTypeUpdatedAt as typeUpdatedAt
    `;

    // Fetch paged data with vehicle type information
    const [items] = await pool.query(
      `SELECT ${selectFields} 
       ${baseQuery} 
       ${whereClause} 
       ORDER BY ${orderBy} ${orderDirection} 
       LIMIT ? OFFSET ?`,
      [...values, limit, offset]
    );

    // Total count (efficient COUNT query)
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total ${baseQuery} ${whereClause}`,
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
