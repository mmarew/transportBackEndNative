const { v4: uuidv4 } = require("uuid");
const currentDate = require("../Utils/CurrentDate");
const { getData } = require("../CRUD/Read/ReadData");
const { insertData } = require("../CRUD/Create/CreateData");
const { updateData } = require("../CRUD/Update/Data.update");
const { createVehicleOwnership } = require("./VehicleOwnership.service");
const { createVehicleStatus } = require("./VehicleStatus.service");
const { removeWhiteSpace } = require("../Validator/Validation");

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
      roleId: 2,
      ownershipStartDate: currentDate(),
    });

    return ownershipResult;
  } catch (error) {
    console.error("Error @createVehicle:", error);
    return { message: "error", error: "Failed to create vehicle" };
  }
};

const getVehicle = async (vehicleUniqueId) => {
  try {
    const result = await getData({
      tableName: "Vehicle",
      conditions: { vehicleUniqueId },
    });
    return result.length
      ? { message: "success", data: result[0] }
      : { message: "error", error: "Vehicle not found" };
  } catch (error) {
    console.error("Error @getVehicle:", error);
    return { message: "error", error: "Failed to get vehicle" };
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

const getAllVehicles = async () => {
  try {
    const result = await getData({ tableName: "Vehicle" });
    return result.length
      ? { message: "success", data: result }
      : { message: "error", error: "No vehicles found" };
  } catch (error) {
    console.error("Error @getAllVehicles:", error);
    return { message: "error", error: "Failed to fetch vehicles" };
  }
};

const verifyUsersVehicle = async (ownerUserUniqueId, user) => {
  try {
    const result = await getData({
      tableName: "Vehicle",
      conditions: { vehicleCreatedBy: ownerUserUniqueId || user.userUniqueId },
    });
    return result.length
      ? { message: "success", data: result }
      : { message: "error", error: "No vehicles found" };
  } catch (error) {
    console.error("Error @verifyUsersVehicle:", error);
    return { message: "error", error: "Failed to verify vehicle" };
  }
};

module.exports = {
  createVehicle,
  getVehicle,
  updateVehicle,
  deleteVehicle,
  getAllVehicles,
  verifyUsersVehicle,
};
