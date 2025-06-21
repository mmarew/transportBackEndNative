const { v4: uuidv4 } = require("uuid");
const { getData } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const deleteData = require("../CRUD/Delete/DeleteData");
const { insertData } = require("../CRUD/Create/CreateData");
const currentDate = require("../Utils/CurrentDate");

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
  let mapedData = {};
  if (requestedBy == 1 || requestedBy == 2) {
    result.map((data) => {
      mapedData[data.journeyStatusName] = data.journeyStatusId;
    });
  } else {
    mapedData = result;
  }
  return {
    message: "success",
    data: mapedData,
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

// Update a journey status by ID
// const updateJourneyStatus = async (journeyStatusUniqueId, body) => {
//   const result = await updateData({
//     tableName: "JourneyStatus",
//     conditions: { journeyStatusUniqueId },
//     updateValues: body,
//   });

//   if (result.affectedRows > 0) {
//     return {
//       message: "success",
//       data: `Journey status with journeyS tatus Unique Id ${journeyStatusUniqueId} updated successfully`,
//     };
//   } else {
//     return {
//       message: "error",
//       error: "Failed to update journey status",
//     };
//   }
// };

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
  const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;
  const passengerRequestUniqueId = body?.passengerRequestUniqueId;
  const driverRequestUniqueId = body?.driverRequestUniqueId;
  const journeyUniqueId = body?.journeyUniqueId;
  const journeyStatusId = body?.journeyStatusId;
  const previousStatusId = body?.previousStatusId;
  const shippingCostByDriver = body?.shippingCostByDriver;
  if (journeyUniqueId) {
    await updateData({
      tableName: "Journey",
      conditions: { journeyUniqueId, journeyStatusId: previousStatusId },
      updateValues: {
        journeyStatusId,
        endTime: currentDate(),
      },
    });
  }
  if (passengerRequestUniqueId) {
    await updateData({
      tableName: "PassengerRequest",
      conditions: {
        passengerRequestUniqueId,
        // journeyStatusId: previousStatusId,
      },
      updateValues: {
        journeyStatusId,
      },
    });
  }

  if (journeyDecisionUniqueId) {
    let updateValues = {
      journeyStatusId,
    };
    // update shipping Cost By Driver if it has values only
    if (shippingCostByDriver)
      updateValues.shippingCostByDriver = shippingCostByDriver;
    await updateData({
      tableName: "JourneyDecisions",
      conditions: {
        journeyDecisionUniqueId,
        // journeyStatusId: previousStatusId,
      },
      updateValues,
    });
  }

  if (driverRequestUniqueId) {
    await updateData({
      tableName: "DriverRequest",
      conditions: {
        driverRequestUniqueId, //journeyStatusId: previousStatusId
      },
      updateValues: {
        journeyStatusId,
      },
    });
  }
  return {
    message: "success",
    data: "Request accepted successfully",
  };
};

module.exports = {
  createJourneyStatus,
  getAllJourneyStatuses,
  getJourneyStatusById,
  updateJourneyStatus,
  deleteJourneyStatus,
};
