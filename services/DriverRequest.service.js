const {
  getData,
  findNearbyPassengers,
  checkActiveDriverRequest,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");

const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");

const {
  insertData,
  createDriverRequest,
  createPassengerRequest,
} = require("../CRUD/Create/CreateData");
const { getUserByUserUniqueId, createUser } = require("./User.service");
const { v4: uuidv4 } = require("uuid");
const {
  sendNotificationToPassenger,
  sendNotificationToAdmin,
} = require("../Utils/Notifications");
const {
  updateUserRoleStatus,
  getUserRoleStatus,
} = require("./UserRoleStatus.service");
const { createCanceledJourney } = require("./CanceledJourneys.service");
const { createJourneyRoutePoint } = require("./JourneyRoutePoints.service");
const PaymentCalculator = require("../Utils/PaymentCalculator");
const { createPayment } = require("./Payments.service");
const calculateCommision = require("../Utils/calculateCommision");
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
  getTarrifRateByVehicleTypeUniqueId,
} = require("./TarrifRateForVehicleTypes.service");
const { createJourneyDecision } = require("./JourneyDecisions.service");
const currentDate = require("../Utils/currentDate");
const { createJourney } = require("./Journey.service");

const createRequest = async (body, user) => {
  try {
    // 1. Check if the user exists
    const userUniqueId = user?.userUniqueId;

    // 2. Check if the driver already has an active request
    const activeRequest = await checkActiveDriverRequest(userUniqueId);
    // 3. Create a new driver request
    if (activeRequest?.length === 0) {
      await createDriverRequest(body, userUniqueId);
    }
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
    const journeyStatusId = 4;
    const userUniqueId = user?.userUniqueId;
    const randNumber = Math.floor(Math.random() * 100000000);
    const data = {
      requestedFrom: "street",
      fullName: "passenger",
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

    if (userPassenger.message === "error")
      return { message: "error", error: "Unable to create user" };
    const dataOfPassenger = userPassenger.dataOfPassenger;
    const passengerUserUniqueId = dataOfPassenger.userUniqueId;
    // create a passenger request in passengerequest table using createPassengerRequest function from passengerRequest.service
    const passengerRequest = await createPassengerRequest(
      body,
      passengerUserUniqueId,
      journeyStatusId
    );

    if (passengerRequest.data.length == 0) {
      return {
        message: "error",
        error: "Unable to create passenger request",
      };
    }
    console.log("@takeFromStreet body =============> ", body);
    const driverRequest = await createDriverRequest(
      body,
      userUniqueId,
      journeyStatusId
    );
    console.log("passengerRequest", passengerRequest);
    console.log("first driverRequest", driverRequest);
    // return driverRequest;
    const decisionData = {
      passengerRequestId: passengerRequest.data[0].passengerRequestId,
      driverRequestId: driverRequest?.data[0].driverRequestId,
      journeyStatusId,
      decisionTime: currentDate(),
      decisionBy: "driver",
    };

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
    console.log("@JourneyPoints", JourneyPoints);
    responseData.journey = journey[0];
    // const vehicle = await verifyUsersVehicle(userUniqueId);
    const vehicle = await getVehicleAndOwnershipViaUserUniqueId(userUniqueId);
    const vehicleTypeUniqueId = vehicle?.data[0]?.vehicleTypeUniqueId;
    const vehicleTarrifRate = await getTarrifRateByVehicleTypeUniqueId(
      vehicleTypeUniqueId
    );
    const driver = await getUserByUserUniqueId(userUniqueId);
    const driverData = {
      driver: { ...driver.data, ...driverRequest.data[0] },
      vehicle: vehicle.data[0],
      vehicleTarrifRate: vehicleTarrifRate.data[0],
    };
    responseData.passenger = {
      ...userPassenger?.dataOfPassenger,
      ...passengerRequest.data[0],
    };
    responseData.driver = driverData;
    responseData.status = journeyStatusId;
    return responseData;
  } catch (error) {
    console.log("Error in createDriverRequest:", error);
    return { message: "error", error: "Unable to create request" };
  }
};
const getDriverRequestByRequestUniqueId = async (driverRequestUniqueId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        driverRequestUniqueId: driverRequestUniqueId,
      },
    });

    if (!result?.length) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    console.log("Error in getDriverRequestById:", error);
    return { message: "error", error: "Unable to retrieve request" };
  }
};
const acceptPassengerRequest = async (body) => {
  const {
    passengerRequestUniqueId,
    journeyDecisionUniqueId,
    driverRequestUniqueId,
  } = body;
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
  if (journeyStatusId === 2) await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = message?.passenger;
  const phoneNumber = passenger?.phoneNumber;
  if (phoneNumber && journeyStatusId === 2)
    sendNotificationToPassenger({
      message: { ...message, status: 3 },
      phoneNumber,
    });

  return message;
};
const startJourney = async (body) => {
  const journeyUniqueId = uuidv4();
  const { latitude, longitude } = body;
  // check if driver has active journey request by journeyDecisionUniqueId,
  const exisistingJourney = await getData({
    tableName: "Journey",
    conditions: { journeyDecisionUniqueId: body.journeyDecisionUniqueId },
  });

  if (exisistingJourney.length == 0) {
    const insertResult = await insertData({
      tableName: "Journey",
      colAndVal: {
        journeyUniqueId,
        journeyDecisionUniqueId: body.journeyDecisionUniqueId,
        journeyStatusId: body.journeyStatusId,
        startTime: new Date(),
      },
    });
    const insertId = insertResult.insertId;
    await createJourneyRoutePoint({ journeyUniqueId, latitude, longitude });
    await updateJourneyStatus(body);
  } else {
  }
  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = message?.passenger;
  phoneNumber = passenger?.phoneNumber;
  // send notification to passenger if driver has a active journey request and passenger has a phone number
  if (phoneNumber && exisistingJourney[0]?.journeyStatusId === 3)
    sendNotificationToPassenger({
      message,
      phoneNumber,
    });

  return message;
};
const noAnswerFromDriver = async (body) => {
  const userUniqueId = body.userUniqueId;
  const existingRequest = await getData({
    tableName: "DriverRequest",
    conditions: { driverRequestUniqueId: body.driverRequestUniqueId },
  });
  const journeyStatusId = existingRequest[0].journeyStatusId;
  if (journeyStatusId != 2) {
    return {
      message: "error",
      error: "driver request not found",
    };
  }
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
  // set journey status to be completed
  await updateJourneyStatus(body);
  const {
    userUniqueId,
    vehicleTypeUniqueId,
    journeyUniqueId,
    passengerRequestUniqueId,
    paymentMethodUniqueId,
    paymentStatusUniqueId,
  } = body;
  const passenger = await performJoinSelect({
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
  });
  const paymentData = await PaymentCalculator({
    vehicleTypeUniqueId,
    journeyUniqueId,
  });
  console.log("paymentData ==================> ", paymentData);
  const vehicleData = await getVehicleOwnershipByUserUniqueId(userUniqueId);
  const driver = await getUserByUserUniqueId(userUniqueId);
  // console.log("@journeyCompleted driver", driver);
  if (paymentData.message == "error") return paymentData;
  const phoneNumber = passenger?.at(0)?.phoneNumber;
  const totalDistance = paymentData?.totalDistance;
  const fare = paymentData.totalMoney;
  if (phoneNumber)
    sendNotificationToPassenger({
      message: {
        driver: { vehicle: vehicleData?.at(0), driver: driver.data },
        passenger: passenger?.at(0),
        message: "success",
        status: 5,
        data: "Journey completed successfully",
        fare,
        totalDistance,
      },
      phoneNumber,
    });

  const totalMoney = paymentData.totalMoney;

  // register payment in to Payment table
  const newPayment = await createPayment(
    journeyUniqueId,
    totalMoney,
    paymentMethodUniqueId,
    paymentStatusUniqueId
  );
  if (newPayment.message == "error") {
    // return newPayment;
  }
  const paymentUniqueId = newPayment?.data?.paymentUniqueId;
  // calculate commision and add to commision table
  const commisionData = await calculateCommision(totalMoney);
  const data = {
    paymentUniqueId,
    commissionRateUniqueId: commisionData?.commissionRateUniqueId,
    commissionAmount: commisionData?.commissionAmount,
  };
  const newCommission = await createCommission(data);
  const transactionUniqueId = newCommission.data.commissionUniqueId;

  const commissionAmount = newCommission.data.commissionAmount;
  const driversCurrentBalance = await getDriverLastBalanceByUserUniqueId(
    userUniqueId
  );

  let currentBalance = driversCurrentBalance?.netBalance;
  if (!currentBalance) currentBalance = 0;
  const netBalance = parseFloat(currentBalance) - parseFloat(commissionAmount);
  const dataOfBalance = {
    userUniqueId,
    transactionType: "payment",
    transactionUniqueId,
    date: new Date(),
    netBalance,
  };
  const dataOfDriverBalance = await createDriverBalance({
    ...dataOfBalance,
  });
  return {
    totalDistance,
    totalMoney,
    netBalance,
    message: "success",
    data: "Journey completed successfully",
    status: 5,
  };
};

const cancelDriverRequest = async (body) => {
  try {
    const user = body.user;
    const roleId = body?.roleId;
    const userUniqueId = user?.userUniqueId;
    const ownerUserUniqueId = body.ownerUserUniqueId;
    const cancellationReasonsTypeId = body.cancellationReasonsTypeId;
    // console.log("@cancelDriverRequest body", body);
    // return;
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
      updateValues: { journeyStatusId: 7 }, // Set journeyStatusId to 7 (cancelled by driver)
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
      });
      return {
        message: "success",
        data: "You have successfully cancelled your request.",
      };
    }

    const passengerRequestId = journeyDecisions[0].passengerRequestId;
    const journeyDecisionUniqueId = journeyDecisions[0].journeyDecisionUniqueId;
    const journeyDecisionId = journeyDecisions[0].journeyDecisionId;

    // Update the PassengerRequest to reflect the cancellation
    await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId },
      updateValues: { journeyStatusId: 7 }, // Set journeyStatusId to 7 (cancelled by driver)
    });

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
    // Send notification to the passenger
    const notificationResult = await sendNotificationToPassenger({
      message: {
        message: "success",
        data:
          userUniqueId === ownerUserUniqueId
            ? "Driver cancelled your request."
            : "Admin cancelled your request.",
        status: userUniqueId === ownerUserUniqueId ? 7 : 8,
      },
      phoneNumber: passenger[0]?.phoneNumber,
    });

    sendNotificationToAdmin({
      message: {
        message: "error",
        error: "driver cancelled passengers request",
        detailInfo: { passenger: passenger[0], driver: getActiveRequest[0] },
      },
    });

    // Update JourneyDecisions to reflect the cancellation
    await updateData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      updateValues: {
        journeyStatusId: userUniqueId === ownerUserUniqueId ? 7 : 8, // 7 for driver, 8 for admin
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

      await createCanceledJourney({
        contextId: journeyDecisionId,
        contextType: "JourneyDecisions",
        canceledBy: userUniqueId,
        cancellationReasonsTypeId,
        roleId,
      });
      return {
        message: "success",
        data: "You have successfully cancelled your request.",
      };
    }
    const journeyId = getActiveJourney[0].journeyId;
    // Update the Journey table (if the journey had already started)
    await updateData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId: 7 }, // Set journeyStatusId to 7 (cancelled by driver)
    });

    await createCanceledJourney({
      contextId: journeyId,
      contextType: "Journey",
      canceledBy: userUniqueId,
      cancellationReasonsTypeId,
    });
    return {
      message: "success",
      data: "You have successfully cancelled your request.",
    };
  } catch (error) {
    console.log("Error cancelling driver request:", error);
    return { message: "error", error: "Unable to cancel driver request" };
  }
};

const updateJourneyStatus = async (body) => {
  const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;
  const passengerRequestUniqueId = body?.passengerRequestUniqueId;
  const driverRequestUniqueId = body?.driverRequestUniqueId;
  const journeyUniqueId = body?.journeyUniqueId;
  const journeyStatusId = body?.journeyStatusId;
  const previousStatusId = body?.previousStatusId;

  if (journeyUniqueId) {
    await updateData({
      tableName: "Journey",
      conditions: { journeyUniqueId, journeyStatusId: previousStatusId },
      updateValues: {
        journeyStatusId,
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
    await updateData({
      tableName: "JourneyDecisions",
      conditions: {
        journeyDecisionUniqueId,
        // journeyStatusId: previousStatusId,
      },
      updateValues: {
        journeyStatusId,
      },
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

const verifyDriverStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // Step 1: Check if the driver has a vehicle
    const vehicleResponse = await getVehicleAndOwnershipViaUserUniqueId(
      userUniqueId
    );
    const vehicle = vehicleResponse?.data?.[0];

    if (!vehicle) {
      return {
        message: "error",
        error: "No vehicle found for this driver",
        status: null,
      };
    }

    const vehicleTypeUniqueId = vehicle.vehicleTypeUniqueId;
    const vehicleTarrifRateResponse = await getTarrifRateByVehicleTypeUniqueId(
      vehicleTypeUniqueId
    );
    const vehicleTarrifRate = vehicleTarrifRateResponse?.data?.[0];

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
    if (journeyStatusId > 4) {
      return {
        message: "success",
        data: "This request is not active at the moment",
        status: null,
        vehicle,
        driver: null,
      };
    }

    if (journeyStatusId === 1) {
      return await handleJourneyStatusOne(
        driverRequest,
        vehicle,
        vehicleTarrifRate,
        vehicleTypeUniqueId
      );
    }

    return await handleExistingJourney(
      driverRequest,
      vehicle,
      vehicleTarrifRate
    );
  } catch (error) {
    console.error("Error in verifyDriverStatus:", error);
    return { message: "error", error: "Unable to verify driver status" };
  }
};

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
    passengerRequestId: passenger.passengerRequestId,
    driverRequestId: driverRequest.driverRequestId,
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
    uniqueIds: {
      driverRequestUniqueId: driverRequest?.driverRequestUniqueId,
      passengerRequestUniqueId: passenger?.passengerRequestUniqueId,
      journeyDecisionUniqueId: journeyDecisionPayload?.journeyDecisionUniqueId,
    },
    driver: { driver: driverRequest, vehicle, vehicleTarrifRate },
    passenger,
    journey: null,
    decisions: journeyDecisionPayload,
  };

  if (passenger?.phoneNumber) {
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

  const responseMessage = {
    uniqueIds: {
      driverRequestUniqueId: driverRequest?.driverRequestUniqueId,
      passengerRequestUniqueId: passenger?.passengerRequestUniqueId,
      journeyDecisionUniqueId: journeyDecision?.journeyDecisionUniqueId,
      journeyUniqueId: journey?.journeyUniqueId,
    },
    status: driverRequest.journeyStatusId,
    driver: { driver: driverRequest, vehicle, vehicleTarrifRate },
    passenger: passenger || null,
    journey: journey || null,
    decisions: journeyDecision || null,
  };

  if (passenger?.phoneNumber) {
    await sendNotificationToPassenger({
      message: responseMessage,
      phoneNumber: passenger.phoneNumber,
    });
  }

  return {
    message: "success",
    status: passenger?.journeyStatusId || driverRequest.journeyStatusId,
    ...responseMessage,
  };
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
const driversDocumentVehicleRequirement = async (body) => {
  const ownerUserUniqueId = body.ownerUserUniqueId;
  const user = body?.user;
  const roleId = 2;
  const phoneNumber = user?.phoneNumber;
  const userRoleStatusDescription = body?.userRoleStatusDescription;

  // Fetch initial user data based on role ID and phone number
  let userRoleStatus = await getUserRoleStatus({ roleId, phoneNumber });
  if (!userRoleStatus || userRoleStatus.length === 0) {
    return { message: "error", data: "User data not found" };
  }

  const { userRoleStatusUniqueId, userRoleId, statusId } = userRoleStatus[0];

  // Fetch required documents for the driver's role
  const requiredDocuments = await performJoinSelect({
    baseTable: "RoleDocumentRequirements",
    joins: [
      {
        table: "DocumentTypes",
        on: "RoleDocumentRequirements.documentTypeId=DocumentTypes.documentTypeId",
      },
    ],
    conditions: { roleId },
  });

  if (!requiredDocuments || requiredDocuments.length === 0) {
    return { message: "error", data: "No documents required for this role" };
  }

  // Fetch attached documents with its type for the driver
  const attachedDocuments = await performJoinSelect({
    // tableName: "AttachedDocuments",
    // conditions: { userUniqueId: ownerUserUniqueId },
    baseTable: "AttachedDocuments",
    joins: [
      {
        table: "DocumentTypes",
        on: "AttachedDocuments.documentTypeId=DocumentTypes.documentTypeId",
      },
    ],
    conditions: { userUniqueId: ownerUserUniqueId },
  });

  // Find unattached document types
  const unAttachedDocumentTypes = requiredDocuments.filter(
    (requiredDocument) =>
      !attachedDocuments.some(
        (attachedDocument) =>
          attachedDocument.documentTypeId === requiredDocument.documentTypeId
      )
  );

  // Group attached documents by their status (PENDING, ACCEPTED, REJECTED)
  const attachedDocumentsByStatus = {
    PENDING: [],
    ACCEPTED: [],
    REJECTED: [],
  };
  attachedDocuments.forEach((attachedDocument) => {
    const documentStatus = attachedDocument.attachedDocumentAcceptance;
    if (attachedDocumentsByStatus[documentStatus]) {
      attachedDocumentsByStatus[documentStatus].push(attachedDocument);
    }
  });

  // Check if the user has a registered vehicle
  const userVehicle = await performJoinSelect({
    baseTable: "VehicleOwnership",
    joins: [
      {
        table: "Vehicle",
        on: "Vehicle.vehicleUniqueId = VehicleOwnership.vehicleUniqueId",
      },
    ],
    conditions: { "VehicleOwnership.userUniqueId": ownerUserUniqueId },
  });
  const vehicleRegistered = userVehicle.length > 0;
  console.log(
    "@driversDocumentVehicleRequirement vehicleRegistered",
    vehicleRegistered
  );
  // Determine the final status based on documents and vehicle status
  const finalStatusId = findStatusByVehicleAndDocuments({
    attachedDocuments,
    attachedDocumentsByStatus,
    requiredDocuments,
    vehicleRegistered,
    unAttachedDocumentTypes,
  });

  // Update role status if necessary
  if (statusId !== finalStatusId) {
    const userRoleStatusData = {
      user,
      roleId,
      userRoleStatusUniqueId,
      userRoleId,
      newStatusId: finalStatusId,
      userRoleStatusDescription,
      phoneNumber,
    };

    await updateUserRoleStatus(userRoleStatusData);
  }
  //get latest user role status

  userData = await getUserRoleStatus({ roleId, phoneNumber });
  return {
    message: "success",
    messageType: "driversDocumentVehicleRequirement",
    vehicle: userVehicle[0] || null,
    userData: userData[0] || null,
    attachedDocumentsByStatus,
    unAttachedDocumentTypes, // Documents that are required but not attached
  };
};

const findStatusByVehicleAndDocuments = ({
  vehicleRegistered,
  attachedDocumentsByStatus,
  requiredDocuments,
  attachedDocuments,
  unAttachedDocumentTypes,
}) => {
  let finalStatusId = null;
  // 1. All Documents Accepted, Vehicle Registered (Active)
  if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length === requiredDocuments.length
  ) {
    finalStatusId = 1;
  }
  // 2. No Document, No Vehicle Registered
  else if (!vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 2;
  }
  // 3. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 3;
  }
  // 4. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 4;
  }
  // 5. Some Documents Accepted, Some Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 5;
  }
  // 6. Some Documents Accepted, Some Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 6;
  }
  // 7. All Documents Accepted, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length === requiredDocuments.length
  ) {
    finalStatusId = 7;
  }
  // 8. No Document Attached, Vehicle Registered
  else if (vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 8;
  }
  // 9. All Documents Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 9;
  }
  // 10. All Documents Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 10;
  }
  // 11. Some Documents Accepted, Some Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 11;
  }
  // 12. Some Documents Accepted, Some Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 12;
  }

  // 13. All Documents Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 13;
  }
  // 14. All Documents Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 14;
  }
  // 15. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 15;
  }
  // 16. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 16;
  }
  // 17. Vehicle Registered, Some Documents Not Attached
  else if (vehicleRegistered && unAttachedDocumentTypes.length > 0) {
    finalStatusId = 17;
  }
  // 18. No Vehicle Registered, Some Documents Not Attached
  else if (!vehicleRegistered && unAttachedDocumentTypes.length > 0) {
    finalStatusId = 18;
  }
  // 19. Vehicle Registered, All Documents Attached, Mixed Statuses
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 19;
  }
  // 20. Vehicle Not Registered, All Documents Attached, Mixed Statuses
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 20;
  }
  // 21. Some Documents Accepted, Some Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 21;
  }
  // 22. Some Documents Accepted, Some Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 22;
  }
  // 23. Some Documents Accepted, Some Pending, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.PENDING.length > 0
  ) {
    finalStatusId = 23;
  }
  // 24. Some Documents Accepted, Some Rejected, Vehicle Registered
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    attachedDocumentsByStatus.REJECTED.length > 0
  ) {
    finalStatusId = 24;
  }
  // 25. All Documents Pending, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
  ) {
    finalStatusId = 25;
  }
  // 26. All Documents Rejected, No Vehicle Registered
  else if (
    !vehicleRegistered &&
    attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
  ) {
    finalStatusId = 26;
  }
  // 27. No Document Attached, Vehicle Registered
  else if (vehicleRegistered && attachedDocuments.length === 0) {
    finalStatusId = 27;
  }
  // 28. Vehicle Registered, All Documents Attached, Mixed Statuses
  else if (
    vehicleRegistered &&
    attachedDocumentsByStatus.ACCEPTED.length > 0 &&
    (attachedDocumentsByStatus.PENDING.length > 0 ||
      attachedDocumentsByStatus.REJECTED.length > 0)
  ) {
    finalStatusId = 28;
  }
  // Default error case
  else {
    return {
      message: "error",
      data: "Unable to determine driver's status.",
    };
  }
  return finalStatusId;
};
module.exports = {
  driversDocumentVehicleRequirement,
  attachRequiredDocuments,
  journeyCompleted,
  noAnswerFromDriver,
  startJourney,
  createRequest,
  getDriverRequestByRequestUniqueId,
  acceptPassengerRequest,
  deleteDriverRequest,
  verifyDriverStatus,
  cancelDriverRequest,
  takeFromStreet,
};
