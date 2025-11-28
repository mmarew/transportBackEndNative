const { v4: uuidv4 } = require("uuid");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const deleteData = require("../CRUD/Delete/DeleteData");
const { insertData } = require("../CRUD/Create/CreateData");
const currentDate = require("../Utils/CurrentDate");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");

// Create a new journey status
const createJourneyStatus = async (body) => {
  const { journeyStatusName, journeyStatusDescription } = body;
  const journeyStatusUniqueId = uuidv4();
  // Check if the journey status already exists
  const existingJourneyStatus = await getData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusName },
  });

  if (existingJourneyStatus.length > 0) {
    return {
      message: "error",
      error: "Journey status already exists",
    };
  }

  const newJourneyStatus = {
    journeyStatusUniqueId,
    journeyStatusName,
    journeyStatusDescription,
    journeyStatusCreatedAt: new Date(),
  };

  const result = await insertData({
    tableName: "JourneyStatus",
    colAndVal: newJourneyStatus,
  });

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "New Journey Status created successfully",
    };
  } else {
    return {
      message: "error",
      error: "Failed to create journey status",
    };
  }
};

// Get all journey statuses
const getAllJourneyStatuses = async (requestedBy) => {
  const result = await getData({ tableName: "JourneyStatus" });
  let mappedData = {};
  if (requestedBy == 1 || requestedBy == 2) {
    result.map((data) => {
      mappedData[data.journeyStatusName] = data.journeyStatusId;
    });
  } else {
    mappedData = result;
  }
  return {
    message: "success",
    data: mappedData,
  };
};

// Get a journey status by ID
const getJourneyStatusById = async (journeyStatusUniqueId) => {
  const result = await getData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusUniqueId },
  });

  if (result.length > 0) {
    return {
      message: "success",
      data: result[0],
    };
  } else {
    return {
      message: "error",
      error: "Journey status not found",
    };
  }
};

// Delete a journey status by ID
const deleteJourneyStatus = async (journeyStatusUniqueId) => {
  const result = await deleteData({
    tableName: "JourneyStatus",
    conditions: { journeyStatusUniqueId },
  });

  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: `Journey status with ID ${journeyStatusUniqueId} deleted successfully`,
    };
  } else {
    return {
      message: "error",
      error: "Failed to delete journey status",
    };
  }
};

const updateJourneyStatus = async (body) => {
  const {
    journeyDecisionUniqueId,
    passengerRequestUniqueId,
    driverRequestUniqueId,
    journeyUniqueId,
    journeyStatusId,
    previousStatusId,
    shippingCostByDriver,
  } = body;

  try {
    // Start a transaction to ensure all updates succeed or fail together
    const updatePromises = [];

    // Update Journey if journeyUniqueId is provided
    if (journeyUniqueId) {
      const journeyConditions = { journeyUniqueId };
      // if (previousStatusId) {
      //   journeyConditions.journeyStatusId = previousStatusId;
      // }
      const updateValues = {
        journeyStatusId,
        ...(journeyStatusId == journeyStatusMap.journeyCompleted && {
          endTime: currentDate(),
        }),
      };
      updatePromises.push(
        updateData({
          tableName: "Journey",
          conditions: journeyConditions,
          updateValues,
        })
      );
    }

    // Update PassengerRequest if passengerRequestUniqueId is provided
    if (
      passengerRequestUniqueId &&
      journeyStatusId !== journeyStatusMap.rejectedByPassenger
    ) {
      const passengerConditions = { passengerRequestUniqueId };
      if (previousStatusId) {
        passengerConditions.journeyStatusId = previousStatusId;
      }

      updatePromises.push(
        updateData({
          tableName: "PassengerRequest",
          conditions: passengerConditions,
          updateValues: { journeyStatusId },
        })
      );
    }

    // Update JourneyDecisions if journeyDecisionUniqueId is provided
    if (journeyDecisionUniqueId) {
      const journeyDecisionConditions = { journeyDecisionUniqueId };
      if (previousStatusId) {
        journeyDecisionConditions.journeyStatusId = previousStatusId;
      }

      const updateValues = { journeyStatusId };
      if (shippingCostByDriver) {
        updateValues.shippingCostByDriver = shippingCostByDriver;
      }

      updatePromises.push(
        updateData({
          tableName: "JourneyDecisions",
          conditions: journeyDecisionConditions,
          updateValues,
        })
      );
    }

    // Update DriverRequest if driverRequestUniqueId is provided
    if (driverRequestUniqueId) {
      const driverConditions = { driverRequestUniqueId };
      // if (previousStatusId) {
      //   driverConditions.journeyStatusId = previousStatusId;
      // }

      updatePromises.push(
        updateData({
          tableName: "DriverRequest",
          conditions: driverConditions,
          updateValues: { journeyStatusId },
        })
      );
    }

    // Execute all updates in parallel and wait for all to complete
    const [Journey] = await Promise.all(updatePromises);
    console.log(
      "@ const [Journey] = await Promise.all(updatePromises);",
      Journey
    );

    return {
      message: "success",
      data: "Request accepted successfully",
    };
  } catch (error) {
    console.log("Error in updateJourneyStatus:", error);
    return {
      message: "error",
      error: "Failed to update journey status: " + error.message,
    };
  }
};

module.exports = {
  createJourneyStatus,
  getAllJourneyStatuses,
  getJourneyStatusById,
  updateJourneyStatus,
  deleteJourneyStatus,
};
