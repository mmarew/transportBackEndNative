const {
  getData,
  findNearbyPassengers,
  checkActiveDriverRequest,
  performJoinSelect,
  getAttachedDocumentsByUserUniqueIdAndDocumentTypeId,
  getDriverRequestByRequestUniqueId,
} = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");
const {
  insertData,
  createDriverRequest,
} = require("../CRUD/Create/CreateData");
const { getUserByUserUniqueId, createUser } = require("./User.service");
const { v4: uuidv4 } = require("uuid");
const {
  sendNotificationToPassenger,
  sendNotificationToAdmin,
  sendNotificationToDriver,
} = require("../Utils/Notifications");
const { createJourneyRoutePoint } = require("./JourneyRoutePoints.service");
const PaymentCalculator = require("../Utils/PaymentCalculator");
const { createPayment } = require("./Payments.service");
const calculateCommision = require("../Utils/CalculateCommision");
const { createCommission } = require("./Commission.service");
const {
  createDriverBalance,
  getDriverLastBalanceByUserUniqueId,
} = require("./DriverBalance.service");
const {
  getVehicleOwnershipByUserUniqueId,
  getVehicleAndOwnershipViaUserUniqueId,
} = require("./VehicleOwnership.service");
const {
  getTariffRateByVehicleTypeUniqueId,
} = require("./TariffRateForVehicleTypes.service");
const {
  createJourneyDecision,
  getJourneyDecisionByJourneyDecisionUniqueId,
  getJourneyDecisionByPassengerRequestUniqueId,
} = require("./JourneyDecisions.service");
const currentDate = require("../Utils/CurrentDate");
const { createJourney } = require("./Journey.service");
const {
  createPassengerRequest,
  getPassengerRequestByPassengerRequestUniqueId,
} = require("./PassengerRequest.service");
const { createCanceledJourney } = require("./CanceledJourneys.service");
const messageTypes = require("../Utils/MessageTypes");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");
const { updateJourneyStatus } = require("./JourneyStatus.service");
const {
  verifyDriverStatus,
  verifyPassengerStatus,
} = require("./UsersCurrentStatus");
const { get } = require("http");

const createRequest = async ({
  body,
  findNewRequest = true,
  journeyStatusId,
}) => {
  try {
    console.log("@createRequest journeyStatusId", journeyStatusId);
    // 1. find user unique id from user object
    const userUniqueId = body?.userUniqueId;

    // 2. Check if the driver already has an active request
    let activeRequest = await checkActiveDriverRequest(userUniqueId);
    console.log("@activeRequest", activeRequest);
    // 3. Create a new driver request
    if (activeRequest?.length === 0) {
      console.log(
        "@createRequest creating new driver request journeyStatusId",
        journeyStatusId
      );
      await createDriverRequest(body, userUniqueId, journeyStatusId);
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }
    if (!findNewRequest) return { message: "success", data: activeRequest };
    return await verifyDriverStatus({
      userUniqueId,
      activeRequest,
    });
  } catch (error) {
    console.log("Error in createDriverRequest:", error);
    return { message: "error", error: "Unable to create request" };
  }
};
const takeFromStreet = async (body, user) => {
  try {
    const journeyStatusId = journeyStatusMap.journeyStarted;
    const userUniqueId = user?.userUniqueId;
    const randNumber = Math.floor(Math.random() * 100000000);
    const requestedFrom = "street";
    const phoneNumber = body?.phoneNumber;
    const data = {
      phoneNumber,
      requestedFrom,
      fullName: null,
      email: `fakeEmail_${randNumber}@passenger.com`,
      roleId: 1,
      statusId: 1,
      userRoleStatusDescription: "this is passenger",
    };
    const responseData = {
      passenger: null,
      driver: null,
      journey: null,
      decision: null,
    };

    // create user passenger in users table. to finishe this job i need to use users table using createUser function from user.service
    const userPassenger = await createUser({ ...body, ...data });
    console.log("@takeFromStreet userPassenger", userPassenger);
    if (userPassenger.message === "error")
      return { message: "error", error: "Unable to create user" };
    const dataOfPassenger = userPassenger?.dataOfPassenger;
    // const passengerUserUniqueId = dataOfPassenger?.userUniqueId;
    // create a passenger request in passengerequest table using createPassengerRequest function from passengerRequest.service
    const passengerRequest = await createPassengerRequest(
      body,
      dataOfPassenger,
      journeyStatusId
    );
    console.log("@ptakeFromStreet assengerRequest", passengerRequest);
    if (!passengerRequest?.passenger) {
      return {
        message: "error",
        error: "Unable to create passenger request",
      };
    }
    const driverRequest = await createDriverRequest(
      body,
      userUniqueId,
      journeyStatusId
    );

    const {
      shippingDate: shippingDateByDriver,
      deliveryDate: deliveryDateByDriver,
      shippingCost: shippingCostByDriver,
    } = body;
    // return driverRequest;
    const decisionData = {
      passengerRequestId: passengerRequest.passenger.passengerRequestId,
      driverRequestId: driverRequest?.data[0].driverRequestId,
      journeyStatusId,
      decisionTime: currentDate(),
      decisionBy: "driver",
      shippingDateByDriver,
      deliveryDateByDriver,
      shippingCostByDriver,
    };
    // console.log("@decisionData", decisionData);

    // return;

    // create a decision in JourneyDecisions table
    const journeyDecision = await createJourneyDecision(decisionData);
    //create a journey in Journey table using createJourney function from Journey.service

    const journeyDecisionUniqueId =
      journeyDecision.data[0].journeyDecisionUniqueId;
    const journeyData = {
      journeyDecisionUniqueId,
      startTime: currentDate(),
      endTime: currentDate(),
      fare: 0,
      journeyStatusId,
    };
    responseData.decision = journeyDecision.data[0];
    const journeyServices = await createJourney(journeyData);
    const journey = journeyServices?.data;
    const originLocation = body.originLocation;
    const JourneyPoints = await createJourneyRoutePoint({
      journeyUniqueId: journey[0].journeyUniqueId,
      latitude: originLocation.latitude,
      longitude: originLocation.longitude,
    });
    responseData.journey = journey[0];
    // const vehicle = await verifyUsersVehicle(userUniqueId);
    const vehicle = await getVehicleAndOwnershipViaUserUniqueId(userUniqueId);
    const vehicleTypeUniqueId = vehicle?.data[0]?.vehicleTypeUniqueId;
    const vehicleTariffRate = await getTariffRateByVehicleTypeUniqueId(
      vehicleTypeUniqueId
    );
    const driver = await getUserByUserUniqueId(userUniqueId);
    const driverData = {
      driver: { ...driver.data, ...driverRequest.data[0] },
      vehicle: vehicle.data[0],
      vehicleTariffRate: vehicleTariffRate.data[0],
    };
    responseData.passenger = {
      ...userPassenger?.dataOfPassenger,
      ...passengerRequest.passenger,
    };
    responseData.driver = driverData;
    responseData.status = journeyStatusId;
    return responseData;
  } catch (error) {
    console.log("Error in createDriverRequest takeFromStreet:", error);
    return { message: "error", error: "Unable to create request" };
  }
};
const createAndAcceptNewRequest = async (body) => {
  try {
    console.log("@createAndAcceptNewRequest body", body);
    const { passengerRequestUniqueId, userUniqueId } = body;
    // get passenger request data by passengerRequestUniqueId,
    const passengerRequest =
      await getPassengerRequestByPassengerRequestUniqueId(
        passengerRequestUniqueId
      );
    console.log(
      "@createAndAcceptNewRequest passengerRequest",
      passengerRequest
    );
    const passegrnerJourneyStatusId = passengerRequest?.data?.journeyStatusId;
    // check if the passenger request is already accepted by driver
    if (passegrnerJourneyStatusId > journeyStatusMap.acceptedByDriver)
      return {
        message: "error",
        error: "Passenger request already accepted by driver",
      };
    // validate if the request exists
    if (passengerRequest?.message === "error") {
      return passengerRequest;
    }

    // 1)update passenger request status to accepted by driver,
    const updatedPassengerRequest = await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestUniqueId },
      updateValues: { journeyStatusId: journeyStatusMap.acceptedByDriver },
    });
    console.log(
      "@createAndAcceptNewRequest updatedPassengerRequest",
      updatedPassengerRequest
    );
    // validate if the update was successful
    if (updatedPassengerRequest.affectedRows === 0) {
      return { message: "error", error: "Passenger request not found" };
    }

    // 2)create driver request,
    const newDriverRequest = await createRequest({
      body,
      findNewRequest: false,
      journeyStatusId: journeyStatusMap.acceptedByDriver,
    });
    console.log(
      "@createAndAcceptNewRequest newDriverRequest",
      newDriverRequest
    );
    // validate if the insert was successfull
    if (newDriverRequest?.message === "error") {
      return newDriverRequest;
    }
    const driverRequestId = newDriverRequest?.data?.[0]?.driverRequestId;

    // 3)create journey decision,
    const journeyDecisionData = {
      passengerRequestId: passengerRequest?.data?.passengerRequestId,
      driverRequestId,
      journeyStatusId: journeyStatusMap?.acceptedByDriver,
      decisionTime: currentDate(),
      decisionBy: "driver",
      shippingCostByDriver: body?.shippingCostByDriver,
    };
    console.log("@journeyDecisionData", journeyDecisionData);
    // return;
    const newJourneyDecision = await createJourneyDecision(journeyDecisionData);
    console.log(
      "@createAndAcceptNewRequest newJourneyDecision",
      newJourneyDecision
    );
    // validate if the insert was successfull
    if (newJourneyDecision?.message === "error") {
      return newJourneyDecision;
    }

    return await verifyDriverStatus({
      userUniqueId,
    });
  } catch (error) {
    console.log("Error in createAndAcceptNewRequest:", error);
    return { message: "error", error: "Unable to create and accept request" };
  }
};
const acceptPassengerRequest = async (body) => {
  const {
    passengerRequestUniqueId,
    journeyDecisionUniqueId,
    driverRequestUniqueId,
  } = body;
  // console.log("@acceptPassengerRequest body =======> ", body);
  // return;
  const existingRequest = await performJoinSelect({
    baseTable: "DriverRequest",
    joins: [
      {
        table: "JourneyDecisions",
        on: "DriverRequest.driverRequestId = JourneyDecisions.driverRequestId",
      },
      {
        table: "PassengerRequest",
        on: "PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId",
      },
    ],
    conditions: {
      "DriverRequest.driverRequestUniqueId": driverRequestUniqueId,
    },
  });

  if (!existingRequest?.length)
    return { message: "error", error: "Request not found" };
  if (
    !existingRequest[0].journeyDecisionUniqueId == journeyDecisionUniqueId ||
    !existingRequest[0].passengerRequestUniqueId == passengerRequestUniqueId
  ) {
    return {
      message: "error",
      error: "Request   found is not valid to accept",
    };
  }
  const journeyStatusId = existingRequest[0].journeyStatusId;
  console.log("@existingRequest", existingRequest);

  if (
    journeyStatusId === journeyStatusMap.requested ||
    journeyStatusId === journeyStatusMap.acceptedByDriver
  )
    await updateJourneyStatus(body);

  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = message?.passenger;
  const phoneNumber = passenger?.phoneNumber;
  if (phoneNumber && journeyStatusId === journeyStatusMap.requested) {
    const passengerStatusData = await verifyPassengerStatus({
      userUniqueId: passenger.userUniqueId,
    });
    sendNotificationToPassenger({
      message: {
        ...passengerStatusData,
        status: journeyStatusMap.acceptedByDriver,
      },
      phoneNumber,
    });
  }

  return message;
};
const startJourney = async (body) => {
  const journeyUniqueId = uuidv4();
  const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;
  const latitude = body?.latitude,
    longitude = body?.longitude;
  // check if driver has active journey request by journeyDecisionUniqueId,
  let existingJourney = await getData({
    tableName: "Journey",
    conditions: { journeyDecisionUniqueId },
  });

  if (existingJourney.length == 0) {
    await insertData({
      tableName: "Journey",
      colAndVal: {
        journeyUniqueId,
        journeyDecisionUniqueId: body.journeyDecisionUniqueId,
        journeyStatusId: body.journeyStatusId,
        startTime: new Date(),
      },
    });
    await createJourneyRoutePoint({ journeyUniqueId, latitude, longitude });
    await updateJourneyStatus(body);
  } else {
  }
  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = [message?.passenger];
  const driver = message?.driver,
    passengersPhoneNumber = passenger?.phoneNumber;
  const journeyStatusId = passenger?.journeyStatusId;
  const messagesToPassenger = {
    ...message,
    drivers: [driver],
  };
  // remove driver
  delete messagesToPassenger?.driver;
  // send notification to passenger if driver has an active journey request and passenger has a phoneNumber
  if (
    passengersPhoneNumber &&
    journeyStatusId == journeyStatusMap.journeyStarted
  )
    await sendNotificationToPassenger({
      message: messagesToPassenger,
      phoneNumber: passengersPhoneNumber,
    });

  return message;
};
// as the name indicates when driver not answered calls noAnswerFromDriver will be executed
const noAnswerFromDriver = async (body) => {
  const passengerRequestUniqueId = body.passengerRequestUniqueId;
  const passengerRequest = await getPassengerRequestByPassengerRequestUniqueId(
    passengerRequestUniqueId
  );
  const driverRequestUniqueId = body.driverRequestUniqueId;
  const driverRequest = await getDriverRequestByRequestUniqueId(
    driverRequestUniqueId
  );

  const driverData = driverRequest.data;
  const passengerData = passengerRequest.data;
  if (passengerData.journeyStatusId > 2 && passengerData.journeyStatusId < 5) {
    return {
      message: "success",
      data: messageTypes.driver_answred_calls,
    };
  }

  const driverPhoneNumber = driverData.phoneNumber;
  const originLocation = {
      latitude: passengerData.originLatitude,
      longitude: passengerData.originLongitude,
      description: passengerData.originPlace,
    },
    vehicle = body.vehicle,
    destination = {
      latitude: passengerData.destinationLatitude,
      longitude: passengerData.destinationLongitude,
      description: passengerData.destinationPlace,
    },
    passengerRequestData = {
      destination,
      vehicle,
      originLocation,
    };

  await updateJourneyStatus(body);

  const newPassengerRequest = await createPassengerRequest(
    passengerRequestData,
    passengerData
  );
  const passengerPhoneNumber = newPassengerRequest?.passenger?.phoneNumber;
  const messageToPassenger = {
    messageType: messageTypes.request_other_driver,
    ...newPassengerRequest,
  };
  const messageToDriver = {
    message: "success",
    pasenger: null,
    driver: null,
    status: null,
    messageType: messageTypes.driver_not_answered,
  };
  sendNotificationToDriver({
    message: messageToDriver,
    phoneNumber: driverPhoneNumber,
  });
  sendNotificationToPassenger({
    message: messageToPassenger,
    phoneNumber: passengerPhoneNumber,
  });
  return {
    status: newPassengerRequest?.passenger?.journeyStatusId,
    message: "success",
    data: messageTypes.driver_not_answered,
  };
};
const journeyCompleted = async (body) => {
  try {
    const {
      journeyDecisionUniqueId,
      userUniqueId,
      vehicleTypeUniqueId,
      journeyUniqueId,
      passengerRequestUniqueId,
      paymentMethodUniqueId,
      paymentStatusUniqueId,
    } = body;

    // 1. Update journey status
    await updateJourneyStatus(body);
    const decisions = await getJourneyDecisionByJourneyDecisionUniqueId(
      journeyDecisionUniqueId
    );
    console.log("@journeyCompleted decisions=======> ", decisions);
    // 2. Fetch data in parallel
    const [vehicleData, driver, passenger] = await Promise.all([
      getVehicleOwnershipByUserUniqueId(userUniqueId),
      getUserByUserUniqueId(userUniqueId),
      performJoinSelect({
        baseTable: "PassengerRequest",
        joins: [
          {
            table: "Users",
            on: "PassengerRequest.userUniqueId=Users.userUniqueId",
          },
        ],
        conditions: {
          "PassengerRequest.passengerRequestUniqueId": passengerRequestUniqueId,
        },
      }),
    ]);

    const phoneNumber = passenger?.at(0)?.phoneNumber;

    // 3. Send notification if passenger phone is available
    if (phoneNumber) {
      sendNotificationToPassenger({
        message: {
          decisions: decisions?.data?.[0],
          drivers: [{ vehicle: vehicleData?.at(0), driver: driver.data }],
          passenger: passenger?.at(0),
          message: "success",
          status: journeyStatusMap.journeyCompleted,
          data: "Journey completed successfully",
        },
        phoneNumber,
      });
    }

    return {
      message: "success",
      data: "Journey completed successfully",
      status: journeyStatusMap.journeyCompleted,
    };
  } catch (error) {
    console.error("@journeyCompleted services error", error);
    return {
      message: "error",
      error: "Unable to complete journey",
      status: journeyStatusMap.journeyCompleted,
    };
  }
};

const cancelDriverRequest = async (body) => {
  try {
    const user = body?.user;
    const roleId = body?.roleId;
    const userUniqueId = user?.userUniqueId;
    const ownerUserUniqueId = body?.ownerUserUniqueId,
      passengerUserUniqueId = body?.passengerUserUniqueId;
    const cancellationReasonsTypeId = body?.cancellationReasonsTypeId;

    // Check if the driver has any active requests

    const getActiveRequest = await checkActiveDriverRequest(ownerUserUniqueId);

    if (getActiveRequest.length === 0) {
      return {
        message: "error",
        error: "No active driver requests found for this user",
      };
    }

    const driverRequestId = getActiveRequest[0].driverRequestId;

    // Update the DriverRequest to reflect the cancellation
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestId },
      updateValues: { journeyStatusId: 9 }, // Set journeyStatusId to 9 (cancelled by driver)
    });

    // Check if the request exists in JourneyDecisions
    const journeyDecisions = await getData({
      tableName: "JourneyDecisions",
      conditions: { driverRequestId },
    });

    if (journeyDecisions.length === 0) {
      // register cancillation in to createCanceledJourney table

      await createCanceledJourney({
        contextId: driverRequestId,
        contextType: "DriverRequest",
        canceledBy: userUniqueId,
        cancellationReasonsTypeId,
        roleId,
        driverUserUniqueId: ownerUserUniqueId,
        passengerUserUniqueId,
      });
      return {
        status: null,
        message: "success",
        data: "You have successfully cancelled your request.",
      };
    }

    const passengerRequestId = journeyDecisions[0].passengerRequestId;
    const journeyDecisionUniqueId = journeyDecisions[0].journeyDecisionUniqueId;
    const journeyDecisionId = journeyDecisions[0].journeyDecisionId;

    // Fetch passenger details
    const passenger = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { passengerRequestId },
    });

    if (!passenger || passenger.length === 0 || !passenger[0]?.phoneNumber) {
      return {
        message: "error",
        data: "Unable to fetch passenger details or phone number",
      };
    }
    const passengerRequestUniqueId = passenger[0].passengerRequestUniqueId;
    const journeyDecisionByPassengerRequestId =
      await getJourneyDecisionByPassengerRequestUniqueId(
        passengerRequestUniqueId
      );
    console.log(
      "@cancelDriverRequest journeyDecisionByPassengerRequestId",
      journeyDecisionByPassengerRequestId
    );
    // if there is only one journey decision(one driver request) for the passenger request return passenger status to waiting status
    if (journeyDecisionByPassengerRequestId?.data?.length === 1) {
      // Update the PassengerRequest to reflect the cancellation and set journeyStatusId to 1 which is returned to waiting status
      await updateData({
        tableName: "PassengerRequest",
        conditions: { passengerRequestId },
        updateValues: { journeyStatusId: journeyStatusMap?.waiting }, // Set journeyStatusId to 1 (return to waiting state )
      });
    } else {
      // if there are multiple journey decisions for the passenger requestdo nothing  because there are other driver requests
    }
    // Send notification to the passenger
    const notificationResult = await sendNotificationToPassenger({
      message: {
        message: "success",
        data:
          userUniqueId === ownerUserUniqueId
            ? "Driver cancelled your request."
            : "Admin cancelled your request.",
        status:
          userUniqueId === ownerUserUniqueId
            ? journeyStatusMap.cancelledByDriver
            : journeyStatusMap.cancelledByAdmin,
      },
      phoneNumber: passenger[0]?.phoneNumber,
    });

    // Update JourneyDecisions to reflect the cancellation
    await updateData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      updateValues: {
        journeyStatusId:
          userUniqueId === ownerUserUniqueId
            ? journeyStatusMap.cancelledByDriver
            : journeyStatusMap.cancelledByAdmin, // 9 for driver, 10 for admin
      },
    });
    // check if the driver has any active requests in Journey table
    const getActiveJourney = await getData({
      tableName: "Journey",
      conditions: {
        "Journey.journeyDecisionUniqueId": journeyDecisionUniqueId,
      },
    });

    if (getActiveJourney.length === 0) {
      // register cancillation in to createCanceledJourney table

      const canceledJourneyResult = await createCanceledJourney({
        contextId: journeyDecisionId,
        contextType: "JourneyDecisions",
        canceledBy: userUniqueId,
        cancellationReasonsTypeId,
        roleId,
        driverUserUniqueId: ownerUserUniqueId,
        passengerUserUniqueId,
      });

      const cancellationDetails = canceledJourneyResult.cancellationDetails;
      const adminNotification = await sendNotificationToAdmin({
        message: {
          message: "success",
          messageType: "cancelledJourney",

          data: [
            {
              driver: getActiveRequest[0], // Driver details
              passenger: passenger[0], // Passenger details
              cancellationDetails,
            },
          ],
        },
      });

      return {
        status: null,
        message: "success",
        data: "You have successfully cancelled your request.",
      };
    }
    const journeyId = getActiveJourney[0].journeyId;
    // Update the Journey table (if the journey had already started)
    await updateData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId: journeyStatusMap.cancelledByDriver }, // Set journeyStatusId to 9 (cancelled by driver)
    });

    await createCanceledJourney({
      contextId: journeyId,
      contextType: "Journey",
      roleId: roleId,
      canceledBy: userUniqueId,
      cancellationReasonsTypeId,
      driverUserUniqueId: ownerUserUniqueId,
      passengerUserUniqueId,
    });
    return {
      status: null,
      message: "success",
      data: "You have successfully cancelled your request.",
    };
  } catch (error) {
    console.log("Error cancelling driver request:", error);
    return { message: "error", error: "Unable to cancel driver request" };
  }
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
    console.log("Error in deleteDriverRequest:", error);
    return { message: "error", error: "Unable to delete request" };
  }
};

const attachRequiredDocuments = async (body) => {
  try {
    const result = await insertData({
      tableName: "DriverRequestDocuments",
      colAndVal: body,
    });
    return result;
  } catch (error) {
    console.log("Error in attachRequiredDocuments:", error);
    return { message: "error", error: "Unable to attach required documents" };
  }
};

const getDriverJourneyStatus = async (userUniqueId) => {
  try {
    const [currentRequest] = await getData({
      tableName: "DriverRequest",
      conditions: { userUniqueId },
      limit: 1,
      orderBy: "driverRequestId",
      orderDirection: "desc",
    });

    const journeyStatusId = currentRequest?.journeyStatusId;
    return journeyStatusId &&
      journeyStatusId < journeyStatusMap.journeyCompleted
      ? journeyStatusId
      : null;
  } catch (error) {
    console.log("Error in getPassengerJourneyStatus:", error);
    return null;
  } finally {
    console.log("getDriverJourneyStatus");
  }
};
const sendUpdatedLocation = async (body) => {
  console.log("@sendUpdatedLocation body is ", body);
  sendNotificationToPassenger({
    phoneNumber: body?.passengerPhone,
    message: { ...body, messageType: messageTypes.update_drivers_location },
  });
  return { message: "success", data: "Location updated successfully" };
};
module.exports = {
  sendUpdatedLocation,
  createAndAcceptNewRequest,
  getDriverJourneyStatus,
  attachRequiredDocuments,
  journeyCompleted,
  noAnswerFromDriver,
  startJourney,
  createRequest,
  acceptPassengerRequest,
  deleteDriverRequest,
  cancelDriverRequest,
  takeFromStreet,
};
