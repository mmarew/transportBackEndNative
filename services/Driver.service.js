const {
  getData,
  findNearbyPassengers,
  checkUserExists,
  checkActiveDriverRequest,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");

const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");

const {
  insertData,
  createDriverRequest,
} = require("../CRUD/Create/CreateData");

const { v4: uuidv4 } = require("uuid");
const { sendNotificationToPassenger } = require("../Utils/Notifications");

const createRequest = async (body, user) => {
  try {
    // 1. Check if the user exists
    const userUniqueId = user?.data?.userUniqueId;
    const vehicleTypeUniqueId = body?.vehicle?.vehicleTypeUniqueId;
    const existingUser = await checkUserExists(userUniqueId);
    if (!existingUser) {
      return { message: "error", error: "User not found" };
    }
    // 2. Check if the driver already has an active request
    const activeRequest = await checkActiveDriverRequest(userUniqueId);
    // 3. Create a new driver request
    if (activeRequest?.length === 0) {
      await createDriverRequest(body, userUniqueId);
    }
    return await verifyDriverStatus({
      userUniqueId,
      activeRequest,
      vehicleTypeUniqueId,
    });
  } catch (error) {
    console.error("Error in createDriverRequest:", error);
    return { message: "error", error: "Unable to create request" };
  }
};

const getDriverRequestById = async (requestId) => {
  try {
    const result = await getData({
      tableName: "DriverRequest",
      conditions: { driverRequestId: requestId },
    });

    if (!result?.length) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    console.error("Error in getDriverRequestById:", error);
    return { message: "error", error: "Unable to retrieve request" };
  }
};
const acceptPassengerRequest = async (body) => {
  await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = message.passenger;
  sendNotificationToPassenger({ message, phoneNumber: passenger?.phoneNumber });

  return message;
};
const startJourney = async (body) => {
  console.log("/driver/startJourney", body);
  const journeyUniqueId = uuidv4();
  const exisistingJourney = await getData({
    tableName: "Journey",
    conditions: { journeyDecisionUniqueId: body.journeyDecisionUniqueId },
  });
  if (exisistingJourney.length == 0) {
    await insertData({
      tableName: "Journey",
      colAndVal: {
        journeyUniqueId,
        journeyDecisionUniqueId: body.journeyDecisionUniqueId,
        journeyStatusId: body.journeyStatusId,
      },
    });
  }
  await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = message.passenger;
  sendNotificationToPassenger({
    message,
    phoneNumber: passenger?.phoneNumber,
  });

  return message;
};
const noAnswerFromDriver = async (body) => {
  const userUniqueId = body.userUniqueId;
  console.log("@noAnswerFromDriver userUniqueId===========> ", userUniqueId);
  await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId,
  });
  const passenger = message.passenger;
  sendNotificationToPassenger({
    message,
    phoneNumber: passenger?.phoneNumber,
  });

  return message;
};
const journeyCompleted = async (body) => {
  const userUniqueId = body.userUniqueId;
  await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId,
  });
  const passenger = message.passenger;
  sendNotificationToPassenger({
    message,
    phoneNumber: passenger?.phoneNumber,
  });

  return message;
};

const canceledByDriver = async (body) => {
  const userUniqueId = body.userUniqueId;
  await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId,
  });
  const passenger = message.passenger;
  sendNotificationToPassenger({
    message,
    phoneNumber: passenger?.phoneNumber,
  });

  return message;
};
const updateJourneyStatus = async (body) => {
  const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;
  const passengerRequestUniqueId = body?.passengerRequestUniqueId;
  const driverRequestUniqueId = body?.driverRequestUniqueId;
  const journeyUniqueId = body?.journeyUniqueId;
  const journeyStatusId = body?.journeyStatusId;
  if (journeyUniqueId) {
    await updateData({
      tableName: "Journey",
      conditions: { journeyUniqueId },
      updateValues: {
        journeyStatusId,
      },
    });
    const Journey = await getData({
      tableName: "Journey",
      conditions: { journeyUniqueId },
    });
    journeyData.Journey = Journey[0];
  }
  if (passengerRequestUniqueId) {
    await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestUniqueId },
      updateValues: {
        journeyStatusId,
      },
    });
  }

  if (journeyDecisionUniqueId) {
    await updateData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      updateValues: {
        journeyStatusId,
      },
    });
  }

  if (driverRequestUniqueId) {
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestUniqueId },
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

const deleteDriverRequest = async (requestId) => {
  try {
    const result = await deleteData({
      tableName: "DriverRequest",
      conditions: { driverRequestId: requestId },
    });

    if (result.affectedRows === 0) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: "Request deleted successfully" };
  } catch (error) {
    console.error("Error in deleteDriverRequest:", error);
    return { message: "error", error: "Unable to delete request" };
  }
};

const verifyDriverStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // check if user has a vehicle to serve customer
    const vehicle = await performJoinSelect({
      baseTable: "Vehicle",
      joins: [
        {
          table: "VehicleOwnership",
          on: "VehicleOwnership.vehicleUniqueId = Vehicle.vehicleUniqueId",
        },
        {
          table: "VehicleType",
          on: "Vehicle.vehicleTypeUniqueId = VehicleType.vehicleTypeUniqueId",
        },
      ],
      conditions: {
        "VehicleOwnership.userUniqueId": userUniqueId,
      },
    });
    if (vehicle.length == 0 || !vehicle) {
      return {
        message: "error",
        error: "No vehicle found for this driver",
        status: null,
      };
    }
    const vehicleTypeUniqueId = vehicle[0].vehicleTypeUniqueId;
    if (!activeRequest || activeRequest?.length == 0) {
      // 1. Check if the user has an active request (status 1, 2, 3, or 4)
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }
    // If no active request, return an error
    if (!activeRequest?.length) {
      return {
        message: "success",
        data: "No active requests found for this driver",
        status: null,
        vehicle: vehicle[0],
      };
    }

    const driverRequest = activeRequest[0]; // Get the first active request
    const journeyStatusId = driverRequest.journeyStatusId;

    // 2. Retrieve driver data
    const driver = (
      await performJoinSelect({
        baseTable: "DriverRequest",
        joins: [
          {
            table: "Users",
            on: "DriverRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: {
          driverRequestUniqueId: driverRequest.driverRequestUniqueId,
        },
      })
    )[0];

    // 3. If journeyStatusId is 1 (Waiting), find a passenger
    if (journeyStatusId === 1) {
      const { originLatitude, originLongitude } = driverRequest;
      const nearbyPassengers = await findNearbyPassengers({
        originLatitude,
        originLongitude,
        vehicleTypeUniqueId,
      });
      console.log("nearbyPassengers", nearbyPassengers);
      // If no passengers are found, return the status
      if (!nearbyPassengers) {
        return {
          message: "success",
          status: 1,
          driver,
          vehicle: vehicle[0],
          passenger: null,
          journey: null,
          decisions: null,
        };
      }

      const passenger = nearbyPassengers; // Get the first nearby passenger

      // 4. Create a new record in JourneyDecisions if passenger is found
      const journeyDecisionUniqueId = uuidv4();
      const journeyDecisionPayload = {
        journeyDecisionUniqueId,
        passengerRequestId: passenger.passengerRequestId,
        driverRequestId: driverRequest.driverRequestId,
        journeyStatusId: 2, // Requested status
        decisionTime: new Date(),
      };

      await insertData({
        tableName: "JourneyDecisions",
        colAndVal: journeyDecisionPayload,
      });
      await updateData({
        tableName: "DriverRequest",
        conditions: {
          driverRequestUniqueId: driverRequest.driverRequestUniqueId,
        },
        updateValues: { journeyStatusId: 2 },
      });
      await updateData({
        tableName: "PassengerRequest",
        conditions: {
          passengerRequestId: passenger.passengerRequestId,
        },
        updateValues: { journeyStatusId: 2 },
      });
      const message = {
          driver,
          vehicle: vehicle[0],
          passenger,
          journey: null,
          decisions: journeyDecisionPayload,
        },
        phoneNumber = passenger?.phoneNumber;
      await sendNotificationToPassenger({ message, phoneNumber });
      // 5. Return response with driver, passenger, and journey decision data
      return {
        message: "success",
        status: "Passenger found and journey decision created",
        ...message,
      };
    }

    // 6. If journeyStatusId is not 1, return data for driver, passenger, journey, and decisions
    const journeyDecision = await getData({
      tableName: "JourneyDecisions",
      conditions: { driverRequestId: driverRequest.driverRequestId },
    });

    const journey = await getData({
      tableName: "Journey",
      conditions: {
        journeyDecisionUniqueId: journeyDecision[0].journeyDecisionUniqueId,
      },
    });

    const passengerData = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { passengerRequestId: journeyDecision[0].passengerRequestId },
    });
    const passenger = passengerData[0];
    const message = {
        vehicle: vehicle[0],
        driver,
        passenger: passenger || null,
        journey: journey[0] || null,
        decisions: journeyDecision[0] || null,
      },
      phoneNumber = passenger?.phoneNumber;
    if (phoneNumber)
      await sendNotificationToPassenger({ message, phoneNumber });
    // 7. Return the final response
    return {
      message: "success",
      status: passenger?.journeyStatusId,
      ...message,
    };
  } catch (error) {
    console.error("Error in verifyDriverStatus:", error);
    return { message: "error", error: "Unable to verify driver status" };
  }
};

module.exports = {
  journeyCompleted,
  noAnswerFromDriver,
  startJourney,
  createRequest,
  getDriverRequestById,
  acceptPassengerRequest,
  deleteDriverRequest,
  verifyDriverStatus,
  canceledByDriver,
};
