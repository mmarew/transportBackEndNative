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

const { getVehicleDrivers } = require("./VehicleDriver.service");
const messageTypes = require("../Utils/MessageTypes");
const { updateJourneyStatus } = require("./JourneyStatus.service");
const {
  VerifyIfPassengerRequestWasNotRejected,
} = require("../Utils/RejectedRequests");
const {
  getJourneyDecision4AllOrSingleUser,
} = require("./JourneyDecisions.service");

// Handle when journeyStatusId is 1
// handleJourneyStatusOne starts here
const handleJourneyStatusOne = async (
  driverRequest,
  vehicle,
  vehicleTypeUniqueId
) => {
  try {
    const {
      originLatitude,
      originLongitude,
      driverRequestUniqueId,
      userUniqueId,
    } = driverRequest;
    console.log("@handleJourneyStatusOne driverRequest", driverRequest);
    // 1. Find nearby passengers
    const nearbyPassengers = await findNearbyPassengers({
      originLatitude,
      originLongitude,
      vehicleTypeUniqueId,
    });
    console.log("@nearbyPassengers", nearbyPassengers);
    // 2. If no passengers found, return early
    if (!nearbyPassengers?.length) {
      return createResponse(driverRequest, vehicle, null, null, 1);
    }

    // 3. Find first non-rejected passenger
    const nonRejectedPassenger = await findNonRejectedPassenger(
      nearbyPassengers,
      userUniqueId
    );
    console.log("@nonRejectedPassenger", nonRejectedPassenger);

    // return;
    // 4. If no suitable passenger found, return waiting status
    if (!nonRejectedPassenger) {
      return createResponse(driverRequest, vehicle, null, null, 1);
    }

    // 5. Create journey decision and update statuses
    const journeyDecisionPayload = createJourneyDecisionPayload(
      nonRejectedPassenger.passengerRequestId,
      driverRequest.driverRequestId
    );

    // 6. Execute all updates in parallel
    await executeStatusUpdates(
      journeyDecisionPayload,
      driverRequestUniqueId,
      nonRejectedPassenger.passengerRequestId
    );

    // 7. Prepare response
    const response = createResponse(
      { ...driverRequest, journeyStatusId: journeyStatusMap?.requested },
      vehicle,
      { ...nonRejectedPassenger, journeyStatusId: journeyStatusMap?.requested },
      journeyDecisionPayload,
      journeyStatusMap?.requested
    );

    // 8. Send notification if passenger has phone number (non-blocking)
    if (nonRejectedPassenger?.phoneNumber) {
      sendPassengerNotification(nonRejectedPassenger).catch(console.error);
    }

    return {
      message: "success",
      status: journeyStatusMap.requested,
      ...response,
    };
  } catch (error) {
    console.error("Error in handleJourneyStatusOne:", error);
    throw error;
  }
};

// Helper functions
const createResponse = (driver, vehicle, passenger, decision, status) => ({
  message: "success",
  status,
  uniqueIds: {
    driverRequestUniqueId: driver?.driverRequestUniqueId,
    passengerRequestUniqueId: passenger?.passengerRequestUniqueId,
    journeyDecisionUniqueId: decision?.journeyDecisionUniqueId,
  },
  driver: { driver, vehicle },
  passenger,
  journey: null,
  decision,
});

const findNonRejectedPassenger = async (passengers, userUniqueId) => {
  for (const passenger of passengers) {
    const rejectedResult = await VerifyIfPassengerRequestWasNotRejected({
      passengerRequestId: passenger.passengerRequestId,
      driverUserUniqueId: userUniqueId,
    });
    console.log("@rejectedResult", rejectedResult);
    if (rejectedResult?.message === "success") {
      return passenger;
    }
  }
  return null;
};

const createJourneyDecisionPayload = (passengerRequestId, driverRequestId) => ({
  journeyDecisionUniqueId: uuidv4(),
  passengerRequestId,
  driverRequestId,
  journeyStatusId: journeyStatusMap.requested,
  decisionTime: new Date(),
});

const executeStatusUpdates = async (
  journeyDecisionPayload,
  driverRequestUniqueId,
  passengerRequestId
) => {
  const queries = [
    insertData({
      tableName: "JourneyDecisions",
      colAndVal: journeyDecisionPayload,
    }),
    updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestUniqueId },
      updateValues: { journeyStatusId: journeyStatusMap.requested },
    }),
    updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId },
      updateValues: { journeyStatusId: journeyStatusMap.requested },
    }),
  ];

  await Promise.all(queries);
};

const sendPassengerNotification = async (passenger) => {
  const passengerStatus = await verifyPassengerStatus({
    userUniqueId: passenger.userUniqueId,
  });

  await sendNotificationToPassenger({
    message: { ...passengerStatus },
    phoneNumber: passenger.phoneNumber,
  });
};

// handleJourneyStatusOne ends here

// Handle existing journey and decisions
const handleExistingJourney = async (
  driverRequest,
  vehicle
  // vehicleTariffRate
) => {
  if (!driverRequest?.driverRequestId) {
    return {
      message: "error",
      error: "Driver request not found",
    };
  }
  if (!vehicle?.vehicleUniqueId) {
    return {
      message: "error",
      error: "Vehicle not found",
    };
  }
  const [journeyDecision] = await getData({
    tableName: "JourneyDecisions",
    conditions: { driverRequestId: driverRequest.driverRequestId },
  });
  const driverRequestUniqueId = driverRequest?.driverRequestUniqueId;

  const journeyDecisionUniqueId = journeyDecision?.journeyDecisionUniqueId;
  const [journey] = await getData({
    tableName: "Journey",
    conditions: {
      journeyDecisionUniqueId,
    },
  });
  const journeyUniqueId = journey?.[0]?.journeyUniqueId;

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
  const passengerRequestUniqueId = passengerData?.[0]?.passengerRequestUniqueId;

  const updateData = {
    journeyDecisionUniqueId,
    passengerRequestUniqueId,
    driverRequestUniqueId,
    journeyUniqueId,
    journeyStatusId: journeyStatusMap?.cancelledByDriver,
  };
  if (!passengerData?.length) {
    // cancel all journey data of this driver by updating JourneyDecisions,PassengerRequest, Journey , DriverRequest ,journey status id to canceled by driver
    updateJourneyStatus(updateData);

    return {
      message: "success",
      status: journeyStatusMap?.cancelledByDriver,
      uniqueIds: {
        driverRequestUniqueId: driverRequest?.driverRequestUniqueId,
        passengerRequestUniqueId,
        journeyDecisionUniqueId,
        journeyUniqueId,
      },
      driver: {
        driver: {
          ...driverRequest,
          journeyStatusId: journeyStatusMap?.cancelledByDriver,
        },
        vehicle,
      },
      passenger: null,
      journey: null,
      decision: null,
    };
  }

  const passenger = passengerData?.[0];
  const userUniqueId = driverRequest?.userUniqueId;

  const documents = await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
    userUniqueId,
    journeyStatusMap?.acceptedByPassenger
  );
  const data = documents?.data;
  const driverProfilePhoto = data?.[data.length - 1]?.attachedDocumentName;
  const driver = {
    driver: { ...driverRequest, driverProfilePhoto },
    vehicle,
  };
  const uniqueIds = {
    driverRequestUniqueId,
    passengerRequestUniqueId,
    journeyDecisionUniqueId,
    journeyUniqueId,
  };
  const journeyStatusId = driverRequest.journeyStatusId;

  const responseMessage = {
    uniqueIds,
    status: journeyStatusId,
    driver,
    passenger: passenger || null,
    journey: journey || null,
    decision: journeyDecision || null,
  };

  if (passenger?.phoneNumber) {
    await sendNotificationToPassenger({
      message: {
        messageTypes:
          journeyStatusId === journeyStatusMap.requested
            ? messageTypes?.driver_found_shipper_request
            : journeyStatusId === journeyStatusMap.acceptedByDriver
            ? messageTypes?.driver_accepted_shipper_request
            : messageTypes?.driver_started_journey,
        message: "success",
        status: journeyStatusId,
        passenger: [passenger],
        drivers: [driver],
        decisions: [journeyDecision] || null,
        journey: journey || null,
        uniqueIds,
      },
      phoneNumber: passenger?.phoneNumber,
    });
  }

  return {
    message: "success",
    status: passenger?.journeyStatusId || journeyStatusId,
    ...responseMessage,
  };
};

// handleExistingJourney ends here

// this function is used to get status of passenger and find driver if driver is not found.
// verifyPassengerStatus starts here
const verifyPassengerStatus = async ({
  userUniqueId,
  activeRequest,
  totalRecords,
  sendNotificationsToDrivers = false,
  pageSize,
  page,
}) => {
  try {
    // 1. Check if the user has an active request (status 1, 2, 3,4,5,6)
    if (!activeRequest || activeRequest?.length == 0) {
      const dataOfActiveRequest = await checkActivePassengerRequest({
        userUniqueId,
        pageSize,
        page,
      });
      activeRequest = dataOfActiveRequest?.activeRequests;
      totalRecords = dataOfActiveRequest?.totalRecords;
    }
    console.log("@activeRequest", activeRequest);
    // If no active request, return an error
    if (activeRequest?.length == 0 || !activeRequest) {
      return {
        message: "success",
        data: "No active  request found for this user",
        status: null,
      };
    }
    const passenger = [],
      decisions = [],
      drivers = [],
      driversData = [],
      decisionsData = [];
    let journey = [];
    // passenger may have many requests so we loop through them
    for (const passengerRequest of activeRequest) {
      const journeyStatusId = passengerRequest.journeyStatusId,
        passengerRequestId = passengerRequest.passengerRequestId;

      passenger.push(passengerRequest);
      //  If journeyStatusId is 1 (Waiting), find  nearby drivers and send to them requests

      if (journeyStatusId === journeyStatusMap?.waiting) {
        // because we use bid base pricing filtration we request five driver for one load request
        const nearbyDrivers = await findNearbyDrivers({ passengerRequest });

        for (const driver of nearbyDrivers) {
          const [documents, vehicle] = await Promise.all([
            getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
              driver?.userUniqueId,
              listOfDocumentsTypeAndId.profilePhoto
            ),
            (async () => {
              const vd = await getVehicleDrivers({
                driverUserUniqueId: driver?.userUniqueId,
                assignmentStatus: "active",
                limit: 1,
                page: 1,
              });
              return vd?.data?.[0];
            })(),
          ]);
          const documentsData = documents?.data;
          const lastDataIndex = documentsData?.length - 1;
          const driverProfilePhoto =
            documentsData?.[lastDataIndex]?.attachedDocumentName;

          const journeyDecisionUniqueId = uuidv4();
          const journeyDecisionPayload = {
            journeyDecisionUniqueId,
            passengerRequestId,
            driverRequestId: driver.driverRequestId,
            journeyStatusId: journeyStatusMap.requested,
            decisionTime: new Date(),
          };
          // create journey decision
          await insertData({
            tableName: "JourneyDecisions",
            colAndVal: journeyDecisionPayload,
          });
          // update passenger request status from waiting to requested
          await updateData({
            tableName: "PassengerRequest",
            conditions: {
              passengerRequestId,
            },
            updateValues: { journeyStatusId: journeyStatusMap.requested },
          });
          // update driver request status from waiting to requested
          await updateData({
            tableName: "DriverRequest",
            conditions: { driverRequestId: driver.driverRequestId },
            updateValues: { journeyStatusId: journeyStatusMap.requested },
          });

          driver.journeyStatusId = journeyStatusMap.requested;
          passengerRequest.journeyStatusId = journeyStatusMap.requested;

          // Push each driver's full data to array
          driversData.push({
            driver: { ...driver, driverProfilePhoto },
            vehicle: vehicle,
            // vehicleTariffRate: vehicleTariffRate?.data[0],
          });

          // Collect journey decisions
          decisionsData.push(journeyDecisionPayload);

          // Send notification
          await sendNotificationToDriver({
            message: {
              message: "success",
              status: journeyStatusMap.requested,
              // passengerRequest is the passenger request object which is connected to driverRequest in JourneyDecisions
              passenger: passengerRequest,
              driver: {
                driver: { ...driver, driverProfilePhoto },
                vehicle: vehicle,
              },
              journey: null,
              decisions: journeyDecisionPayload,
              totalRecords: totalRecords,
              pageSize,
              page,
            },
            phoneNumber: driver?.phoneNumber,
          });
        }

        drivers.push(...driversData);
        decisions.push(...decisionsData);
      }
      //  If journeyStatusId is not 1, return current data of passenger, driver, journey, and decisions
      else {
        // const decisionsData = await getData({
        //   tableName: "JourneyDecisions",
        //   conditions: {
        //     passengerRequestId: passengerRequest?.passengerRequestId,
        //     journeyStatusId: journeyStatusMap.requested,
        //   },
        // });
        const filters = {
          passengerRequestId: passengerRequest?.passengerRequestId,
          journeyStatusIds: [
            journeyStatusMap.requested,
            journeyStatusMap.acceptedByDriver,
          ],
        };
        const decisionsData = await getJourneyDecision4AllOrSingleUser({
          data: { filters },
        });
        console.log("@decisionsData", decisionsData);
        // return;

        for (let journeyDecision of decisionsData?.data) {
          decisions.push(journeyDecision);
          const journeyStatusId = journeyDecision.journeyStatusId;
          // journey can be created after journey is started
          if (journeyStatusId >= journeyStatusMap?.journeyStarted)
            journey = await getData({
              tableName: "Journey",
              conditions: {
                journeyDecisionUniqueId:
                  journeyDecision?.journeyDecisionUniqueId,
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
            conditions: {
              driverRequestId: journeyDecision?.driverRequestId,
            },
          });

          const driver = driverData[0];
          const documents =
            await getAttachedDocumentsByUserUniqueIdAndDocumentTypeId(
              driver?.userUniqueId,
              listOfDocumentsTypeAndId.profilePhoto
            );

          const data = documents?.data;
          const lastDataIndex = data?.length - 1;
          const driverProfilePhoto =
            data?.[lastDataIndex]?.attachedDocumentName;
          const phoneNumber = driver?.phoneNumber;

          const vdResult = await getVehicleDrivers({
            driverUserUniqueId: driver?.userUniqueId,
            assignmentStatus: "active",
            limit: 1,
            page: 1,
          });
          const vehicleOfDriver = vdResult?.data;

          const driverInfo = {
            vehicleOfDriver: vehicleOfDriver?.[0],
            driver: { ...driver, driverProfilePhoto },
          };
          driversData.push(driverInfo);

          // find matching passenger request of journeyDecision
          const matchingPassengerRequest = passenger.find(
            (passengerRequest) =>
              passengerRequest.passengerRequestId ==
              journeyDecision.passengerRequestId
          );
          console.log(
            "@journeyDecision",
            journeyDecision,
            "\n@matchingPassengerRequest",
            matchingPassengerRequest,
            "\nphoneNumber",
            phoneNumber,
            "@sendNotificationsToDrivers",
            sendNotificationsToDrivers
          );
          const message = {
            message: "success",
            status: driver?.journeyStatusId,
            passenger: matchingPassengerRequest,
            driver: driverInfo,
            journey: journey?.length > 0 ? journey[0] : null,
            decision: journeyDecision || null,
          };
          if (sendNotificationsToDrivers)
            if (phoneNumber) {
              await sendNotificationToDriver({
                message,
                phoneNumber,
              });
            }
        }
      }
    }
    // Final return after loop: only summary
    return {
      message: "success",
      totalRecords,
      pageSize,
      page,
    };
  } catch (error) {
    console.log("Error in verifyPassengerStatus:", error);
    return { message: "error", error: "Unable to verify passenger status" };
  }
};

// verifyPassengerStatus ends here

// verifyDriverStatus starts here
const verifyDriverStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // Step 1: Check if the driver has a vehicle via VehicleDriver relation
    const vdResult = await getVehicleDrivers({
      driverUserUniqueId: userUniqueId,
      assignmentStatus: "active",
      limit: 1,
      page: 1,
    });
    const vehicle = vdResult?.data?.[0];
    if (!vehicle) {
      return {
        message: "error",
        error: "No vehicle found for this driver",
        status: null,
      };
    }

    const vehicleTypeUniqueId = vehicle?.vehicleTypeUniqueId;

    // Step 2: Check for an active driver request
    if (!activeRequest?.length) {
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }

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
        vehicleTypeUniqueId
      );
      return JourneyStatusOne;
    }

    const existingJourney = await handleExistingJourney(driverRequest, vehicle);
    return existingJourney;
  } catch (error) {
    console.log("Error in verifyDriverStatus:", error);
    return { message: "error", error: "Unable to verify driver status" };
  }
};

// verifyDriverStatus ends here

module.exports = { verifyPassengerStatus, verifyDriverStatus };
