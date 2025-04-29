const { insertData } = require("../CRUD/Create/CreateData");
const { v4: uuidv4 } = require("uuid");

const {
  checkActiveDriverRequest,
  findNearbyPassengers,
  performJoinSelect,
  findNearbyDrivers,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
  getData,
  checkActivePassengerRequest,
} = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  journeyStatusMap,
  listOfDocumentsTypeAndId,
} = require("../Utils/ListOfFixedData");
const {
  sendNotificationToDriver,
  sendNotificationToPassenger,
} = require("../Utils/Notifications");
const {
  getTarrifRateByVehicleTypeUniqueId,
} = require("./TarrifRateForVehicleTypes.service");
const {
  getVehicleAndOwnershipViaUserUniqueId,
  getVehicleOwnershipByUserUniqueId,
} = require("./VehicleOwnership.service");

// Handle when journeyStatusId is 1
const handleJourneyStatusOne = async (
  driverRequest,
  vehicle,
  vehicleTarrifRate,
  vehicleTypeUniqueId
) => {
  const { originLatitude, originLongitude } = driverRequest;
  const nearbyPassengers = await findNearbyPassengers({
    originLatitude,
    originLongitude,
    vehicleTypeUniqueId,
  });
  // if there is no passenger  near to driver
  if (!nearbyPassengers?.length) {
    return {
      message: "success",
      status: 1, // Waiting
      uniqueIds: {
        driverRequestUniqueId: driverRequest?.driverRequestUniqueId,
      },
      driver: { driver: driverRequest, vehicle, vehicleTarrifRate },
      passenger: null,
      journey: null,
      decisions: null,
    };
  }

  const passenger = nearbyPassengers[0];
  const journeyDecisionPayload = {
    journeyDecisionUniqueId: uuidv4(),
    passengerRequestId: passenger?.passengerRequestId,
    driverRequestId: driverRequest?.driverRequestId,
    journeyStatusId: 2, // Requested
    decisionTime: new Date(),
  };

  await Promise.all([
    insertData({
      tableName: "JourneyDecisions",
      colAndVal: journeyDecisionPayload,
    }),
    updateData({
      tableName: "DriverRequest",
      conditions: {
        driverRequestUniqueId: driverRequest.driverRequestUniqueId,
      },
      updateValues: { journeyStatusId: 2 },
    }),
    updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: passenger.passengerRequestId },
      updateValues: { journeyStatusId: 2 },
    }),
  ]);

  const message = {
    status: 2,
    uniqueIds: {
      driverRequestUniqueId: driverRequest?.driverRequestUniqueId,
      passengerRequestUniqueId: passenger?.passengerRequestUniqueId,
      journeyDecisionUniqueId: journeyDecisionPayload?.journeyDecisionUniqueId,
    },
    driver: {
      driver: { ...driverRequest, journeyStatusId: 2 },
      vehicle,
      vehicleTarrifRate,
    },
    passenger: { ...passenger, journeyStatusId: 2 },
    journey: null,
    decisions: journeyDecisionPayload,
  };

  if (passenger?.phoneNumber) {
    const passengerStatus = await verifyPassengerStatus({
      userUniqueId: passenger.userUniqueId,
    });
    await sendNotificationToPassenger({
      message,
      phoneNumber: passenger.phoneNumber,
    });
  }

  return {
    message: "success",
    status: 2, // Passenger found and requested
    ...message,
  };
};

// Handle existing journey and decisions
const handleExistingJourney = async (
  driverRequest,
  vehicle,
  vehicleTarrifRate
) => {
  const [journeyDecision] = await getData({
    tableName: "JourneyDecisions",
    conditions: { driverRequestId: driverRequest.driverRequestId },
  });
  console.log("journeyDecision", journeyDecision);
  const [journey] = await getData({
    tableName: "Journey",
    conditions: {
      journeyDecisionUniqueId: journeyDecision?.journeyDecisionUniqueId,
    },
  });
  console.log("journey", journey);
  const passengerData = await performJoinSelect({
    baseTable: "PassengerRequest",
    joins: [
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { passengerRequestId: journeyDecision?.passengerRequestId },
  });

  const passenger = passengerData?.[0];
  const userUniqueId = driverRequest?.userUniqueId;

  const documents = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
    userUniqueId,
    4
  );
  const data = documents?.data;
  const driverProfilePhoto = data?.[data.length - 1]?.attachedDocumentName;
  console.log("driverProfilePhoto", driverProfilePhoto);
  const responseMessage = {
    uniqueIds: {
      driverRequestUniqueId: driverRequest?.driverRequestUniqueId,
      passengerRequestUniqueId: passenger?.passengerRequestUniqueId,
      journeyDecisionUniqueId: journeyDecision?.journeyDecisionUniqueId,
      journeyUniqueId: journey?.journeyUniqueId,
    },
    status: driverRequest.journeyStatusId,
    driver: {
      driver: { ...driverRequest, driverProfilePhoto },
      vehicle,
      vehicleTarrifRate,
    },
    passenger: passenger || null,
    journey: journey || null,
    decisions: journeyDecision || null,
  };

  if (passenger?.phoneNumber) {
    const passengerStatus = await verifyPassengerStatus({
      userUniqueId: passenger.userUniqueId,
    });
    await sendNotificationToPassenger({
      message: passengerStatus,
      phoneNumber: passenger.phoneNumber,
    });
  }

  return {
    message: "success",
    status: passenger?.journeyStatusId || driverRequest.journeyStatusId,
    ...responseMessage,
  };
}; // this function is used to get status of passenger and find driver if driver is not found.
const verifyPassengerStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // 1. Check if the user has an active request (status 1, 2, 3, or 4)
    if (!activeRequest || activeRequest?.length == 0)
      activeRequest = await checkActivePassengerRequest(userUniqueId);
    // If no active request, return an error
    if (activeRequest?.length == 0) {
      return {
        message: "success",
        data: "No active  request found for this user",
        status: null,
      };
    }

    const passengerRequest = activeRequest[0]; // Get the first active request
    const journeyStatusId = passengerRequest.journeyStatusId;

    // 2. Retrieve passenger data
    const passenger = (
      await performJoinSelect({
        baseTable: "PassengerRequest",
        joins: [
          {
            table: "Users",
            on: "PassengerRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: {
          passengerRequestUniqueId: passengerRequest.passengerRequestUniqueId,
        },
      })
    )[0];

    // 3. If journeyStatusId is 1 (Waiting), find  drivers and send to them requests

    if (journeyStatusId === journeyStatusMap.waiting) {
      const nearbyDrivers = await findNearbyDrivers({ passengerRequest });

      if (!nearbyDrivers?.length) {
        return {
          message: "success",
          status: journeyStatusMap.waiting,
          passenger,
          drivers: [], // Return empty array for drivers
          journey: null,
          decisions: [],
        };
      }

      const driversData = [];
      const decisionsData = [];

      for (let i = 0; i < nearbyDrivers.length; i++) {
        const driver = nearbyDrivers[i];

        const documents =
          await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
            driver?.userUniqueId,
            listOfDocumentsTypeAndId.profilePhoto
          );

        const driverProfilePhoto =
          documents?.data?.[documents.data.length - 1]?.attachedDocumentName;

        const journeyDecisionUniqueId = uuidv4();
        const journeyDecisionPayload = {
          journeyDecisionUniqueId,
          passengerRequestId: passengerRequest.passengerRequestId,
          driverRequestId: driver.driverRequestId,
          journeyStatusId: journeyStatusMap.requested,
          decisionTime: new Date(),
        };

        await insertData({
          tableName: "JourneyDecisions",
          colAndVal: journeyDecisionPayload,
        });

        await updateData({
          tableName: "PassengerRequest",
          conditions: {
            passengerRequestId: passengerRequest.passengerRequestId,
          },
          updateValues: { journeyStatusId: journeyStatusMap.requested },
        });

        await updateData({
          tableName: "DriverRequest",
          conditions: { driverRequestId: driver.driverRequestId },
          updateValues: { journeyStatusId: journeyStatusMap.requested },
        });

        driver.journeyStatusId = journeyStatusMap.requested;
        passengerRequest.journeyStatusId = journeyStatusMap.requested;

        const vehicle = await getVehicleOwnershipByUserUniqueId(
          driver?.userUniqueId
        );
        const vehicleTypeUniqueId = vehicle[0]?.vehicleTypeUniqueId;

        const vehicleTarrifRate = await getTarrifRateByVehicleTypeUniqueId(
          vehicleTypeUniqueId
        );

        // Push each driver's full data to array
        driversData.push({
          driver: { ...driver, driverProfilePhoto },
          vehicle: vehicle,
          vehicleTarrifRate: vehicleTarrifRate?.data[0],
        });

        // Collect journey decisions
        decisionsData.push(journeyDecisionPayload);

        // Send notification
        await sendNotificationToDriver({
          message: {
            message: "success",
            status: journeyStatusMap.requested,
            passenger,
            driver: {
              driver: { ...driver, driverProfilePhoto },
              vehicle: vehicle,
              vehicleTarrifRate: vehicleTarrifRate?.data[0],
            },
            journey: null,
            decisions: journeyDecisionPayload,
          },
          phoneNumber: driver?.phoneNumber,
        });
      }

      // Final response after processing all drivers
      return {
        message: "success",
        status: journeyStatusMap.requested,
        passenger,
        drivers: driversData,
        journey: null,
        decisions: decisionsData,
      };
    }

    // 6. If journeyStatusId is not 1, return data for passenger, driver, journey, and decisions

    const journeyDecision = await getData({
      tableName: "JourneyDecisions",
      conditions: { passengerRequestId: passengerRequest.passengerRequestId },
    });

    const results = []; // Collect all responses here
    const driversData = [],
      decisionsData = [];
    let journey = null;

    for (let i = 0; i < journeyDecision.length; i++) {
      const journeyStatusId = journeyDecision[i].journeyStatusId;
      // journey can be created after journey is started
      if (journeyStatusId >= journeyStatusMap.journeyStarted)
        journey = await getData({
          tableName: "Journey",
          conditions: {
            journeyDecisionUniqueId:
              journeyDecision?.[i]?.journeyDecisionUniqueId,
          },
        });

      const driverData = await performJoinSelect({
        baseTable: "DriverRequest",
        joins: [
          {
            table: "Users",
            on: "DriverRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { driverRequestId: journeyDecision?.[i]?.driverRequestId },
      });

      const driver = driverData[0];
      const documents =
        await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
          driver?.userUniqueId,
          listOfDocumentsTypeAndId.profilePhoto
        );

      const data = documents?.data;
      const driverProfilePhoto = data?.[data.length - 1]?.attachedDocumentName;
      const phoneNumber = driver?.phoneNumber;

      const vehicleOfDriver = await getVehicleOwnershipByUserUniqueId(
        driver?.userUniqueId
      );
      const vehicleTarrifRate = await getTarrifRateByVehicleTypeUniqueId(
        vehicleOfDriver[0]?.vehicleTypeUniqueId
      );

      const driverInfo = {
        vehicleOfDriver: vehicleOfDriver[0],
        driver: { ...driver, driverProfilePhoto },
        vehicleTarrifRate: vehicleTarrifRate?.data[0],
      };
      driversData.push(driverInfo);
      decisionsData.push();
      const message = {
        message: "success",
        status: driver?.journeyStatusId,
        passenger,
        driver: driverInfo,
        journey: journey,
        decisions: journeyDecision[i] || null,
      };

      if (phoneNumber) {
        await sendNotificationToDriver({
          message,
          phoneNumber,
        });
      }
    }
    console.log("@verifyPassengerStatus  results", results);
    // Final return after loop
    const message = {
      message: "success",
      status: passenger?.journeyStatusId,
      passenger,
      drivers: driversData,
      journey: journey,
      decisions: journeyDecision,
    };
    return message;
  } catch (error) {
    console.log("Error in verifyPassengerStatus:", error);
    return { message: "error", error: "Unable to verify passenger status" };
  }
};
const verifyDriverStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // Step 1: Check if the driver has a vehicle
    const vehicleResponse = await getVehicleAndOwnershipViaUserUniqueId(
      userUniqueId
    );
    // console.log("@verifyDriverStatus vehicleResponse", vehicleResponse);
    const vehicle = vehicleResponse?.data?.[0];
    if (!vehicle) {
      return {
        message: "error",
        error: "No vehicle found for this driver",
        status: null,
      };
    }

    const vehicleTypeUniqueId = vehicle?.vehicleTypeUniqueId;
    const vehicleTarrifRateResponse = await getTarrifRateByVehicleTypeUniqueId(
      vehicleTypeUniqueId
    );

    const vehicleTarrifRate = vehicleTarrifRateResponse?.data?.[0];

    // Step 2: Check for an active driver request
    if (!activeRequest?.length) {
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }
    console.log("@verifyDriverStatus activeRequest=======> ", activeRequest);
    const driverRequest = activeRequest?.[0];

    if (!driverRequest) {
      return {
        message: "success",
        data: "No active requests found for this driver",
        status: null,
        vehicle,
      };
    }

    // Step 3: Validate journey status
    const journeyStatusId = driverRequest.journeyStatusId;
    console.log("journeyStatusId", journeyStatusId);
    if (journeyStatusId > journeyStatusMap.journeyCompleted) {
      return {
        message: "success",
        data: "This request is not active at the moment",
        status: null,
        vehicle,
        driver: null,
        passenger: null,
      };
    }

    if (journeyStatusId === journeyStatusMap.waiting) {
      const JourneyStatusOne = await handleJourneyStatusOne(
        driverRequest,
        vehicle,
        vehicleTarrifRate,
        vehicleTypeUniqueId
      );
      return JourneyStatusOne;
    }

    const existingJourney = await handleExistingJourney(
      driverRequest,
      vehicle,
      vehicleTarrifRate
    );
    return existingJourney;
  } catch (error) {
    console.log("Error in verifyDriverStatus:", error);
    return { message: "error", error: "Unable to verify driver status" };
  }
};
module.exports = { verifyPassengerStatus, verifyDriverStatus };
