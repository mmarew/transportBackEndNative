const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/deleteData");
const {
  verifyExistanceOfData,
  findDriverForPassenger,
  findPassengerForDriver,
} = require("../CRUD/Read/ReadData");
const { v4: uuidv4 } = require("uuid");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  sendNotificationToDriver,
  sendNotificationToPassenger,
} = require("../Utils/Notifications");
const FindDriverForPassenger = require("../Utils/FindDriverToPassanger");
// begin of createRequest
const createRequest = async (body, user) => {
  try {
    const { userUniqueId } = user?.data;
    const { requestType } = body; // 'PASSENGER' or 'DRIVER'

    // Step 1: Verify if the user exists
    const existedUser = await verifyExistanceOfData({
      tableName: "Users",
      conditions: { userUniqueId },
    });

    if (existedUser.length <= 0) {
      return { message: "error", error: "User not found" };
    }

    // Step 2: Check if the user already has an active request
    const requestResults = await verifyExistanceOfData({
      tableName: "Requests",
      conditions: { userUniqueId, requestType, journeyStatusId: [1, 2, 3, 4] }, // Active states
      operator: "AND",
    });

    if (requestResults.length > 0) {
      return await handleExistingRequest(
        requestResults[0],
        existedUser[0],
        requestType
      );
    }

    // Step 3: Validate and create a new request
    return await handleNewRequest(
      body,
      userUniqueId,
      existedUser[0],
      requestType
    );
  } catch (error) {
    console.error("@createRequest catch error", error);
    return { message: "error", error: "Unable to create request" };
  }
};
const getJourneyDetails = async (decision) => {
  try {
    // Use verifyExistanceOfData to fetch journey details based on the journeyDecisionUniqueId
    const journeyDetails = await verifyExistanceOfData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId: decision.journeyDecisionUniqueId },
    });

    return journeyDetails; // Returning the journey details found
  } catch (error) {
    console.error("Error fetching journey details:", error);
    throw error; // Handle or re-throw the error as needed
  }
};

const handlePassengerFoundForDriver = async (passenger, request) => {
  const status = 2; // 'requested'

  // Update the driver's request status
  await updateData({
    tableName: "Requests",
    conditions: { requestUniqueId: request?.requestUniqueId },
    updateValues: { journeyStatusId: status },
  });

  // Insert data into JourneyDecisions table
  const journeyDecisionUniqueId = uuidv4();
  let decision = await insertData({
    tableName: "JourneyDecisions",
    colAndVal: {
      journeyDecisionUniqueId,
      passengerRequestId: passenger?.requestUniqueId,
      driverWaitId: request?.requestUniqueId,
      journeyStatusId: status,
      decisionTime: new Date(),
    },
  });

  // Fetch the decision details

  decision = await verifyExistanceOfData({
    tableName: "JourneyDecisions",
    conditions: {
      journeyDecisionUniqueId,
    },
  });
  decision = decision?.at(0);
  // Notify the passenger
  await sendNotificationToPassenger({
    message: { passenger, request, decision },
    phoneNumber: passenger?.phoneNumber,
  });

  return decision;
};

// handle passenger request
const processPassengerRequest = async (existedUser, existingRequest) => {
  const requestUniqueId = existingRequest.requestUniqueId;
  let driver = null;
  let decision = null;

  // Find a driver for the passenger
  driver = await FindDriverForPassenger(existedUser.userUniqueId);
  if (driver) {
    // it will return decision object , that shows driver and passenger are requested or accepted
    decision = await handleDriverFoundForPassenger(driver, existingRequest);
  }

  // Prepare the passenger object for the response
  let passenger = { ...existedUser, ...existingRequest };

  // Build and return the response
  return buildResponse({
    passenger,
    driver,
    status: existingRequest.journeyStatusId,
    decision,
  });
};
const buildResponse = ({ passenger, driver, status, decision, journey }) => {
  return {
    message: "success", // Indicates the operation was successful
    passenger: passenger ? passenger : null, // If passenger data is provided, include it; otherwise, set it to null
    driver: driver ? driver : null, // If driver data is provided, include it; otherwise, set it to null
    status: status !== undefined ? status : null, // Include journey status if available, otherwise set to null
    decision: decision ? decision : null, // Include decision details if available, otherwise set to null
    journey: journey ? journey : null, // Include journey details if available, otherwise set to null
  };
};

const processDriverRequest = async (existedUser, existingRequest) => {
  const requestUniqueId = existingRequest.requestUniqueId;
  let passenger = null;
  let decision = null;

  // Notify passengers about the driver's availability
  passenger = await findPassengerForDriver(existedUser.userUniqueId);
  if (passenger) {
    await handlePassengerFoundForDriver(passenger, existingRequest);

    // Check if a journey decision exists
    decision = await verifyExistanceOfData({
      tableName: "JourneyDecisions",
      conditions: {
        driverRequestId: requestUniqueId,
        passengerWaitId: passenger.requestUniqueId,
      },
    });
  }

  // Prepare the driver object for the response
  let driver = { ...existedUser, ...existingRequest };

  // Build and return the response
  return buildResponse({
    passenger,
    driver,
    status: existingRequest.journeyStatusId,
    decision,
  });
};

// Handle existing request logic
const handleExistingRequest = async (
  existingRequest,
  existedUser,
  requestType
) => {
  let status = existingRequest.journeyStatusId;
  const requestUniqueId = existingRequest.requestUniqueId;
  // journeyStatusId 1 is in waiting stage
  if (status === 1) {
    if (requestType === "PASSENGER") {
      return await processPassengerRequest(existedUser, existingRequest);
    } else if (requestType === "DRIVER") {
      return await processDriverRequest(existedUser, existingRequest);
    }
  } else if ([2, 3, 4].includes(status)) {
    return await handleOngoingJourney(
      existedUser,
      existingRequest,
      requestType,
      requestUniqueId
    );
  }
};

// Process new request logic
const handleNewRequest = async (
  body,
  userUniqueId,
  existedUser,
  requestType
) => {
  const uniqueid = uuidv4();

  if (requestType === "PASSENGER") {
    const { originLocation, destination, vehicle } = body;

    if (!originLocation || !destination || !vehicle) {
      return {
        message: "error",
        error: "Please provide current location, destination, and vehicle",
      };
    }

    // Insert the passenger's request into the database
    const resultOfRegisterRequest = await insertData({
      tableName: "Requests",
      colAndVal: {
        requestUniqueId: uniqueid,
        userUniqueId,
        vehicleTypeId: vehicle.vehicleTypeId,
        originLatitude: originLocation.latitude,
        originLongitude: originLocation.longitude,
        originPlace: originLocation.description,
        destinationLatitude: destination.latitude,
        destinationLongitude: destination.longitude,
        destinationPlace: destination.description,
        requestTime: new Date(),
        requestType, // 'PASSENGER'
        journeyStatusId: 1, // Initial status: 'waiting'
      },
    });

    if (resultOfRegisterRequest.affectedRows > 0) {
      return await handleNewPassengerRequest(
        userUniqueId,
        uniqueid,
        existedUser
      );
    } else {
      return { message: "error", error: "Unable to create request" };
    }
  }

  if (requestType === "DRIVER") {
    const { currentLocation, vehicle } = body;

    if (!currentLocation || !vehicle) {
      return {
        message: "error",
        error: "Please provide current location and vehicle",
      };
    }

    // Insert the driver's request into the database
    const resultOfRegisterRequest = await insertData({
      tableName: "Requests",
      colAndVal: {
        requestUniqueId: uniqueid,
        userUniqueId,
        vehicleTypeId: vehicle.vehicleTypeId,
        originLatitude: currentLocation.latitude,
        originLongitude: currentLocation.longitude,
        originPlace: currentLocation.description || null, // Optional description
        requestTime: new Date(),
        requestType, // 'DRIVER'
        journeyStatusId: 1, // Initial status: 'waiting'
      },
    });

    if (resultOfRegisterRequest.affectedRows > 0) {
      return await handleNewDriverRequest(userUniqueId, uniqueid, existedUser);
    } else {
      return { message: "error", error: "Unable to create request" };
    }
  }
};

// Process a new passenger request
const handleNewPassengerRequest = async (
  userUniqueId,
  requestUniqueId,
  existedUser
) => {
  let driver = await findDriverForPassenger(userUniqueId);
  let decision = null;

  if (driver) {
    decision = await handleDriverFoundForPassenger(driver, {
      requestUniqueId,
      userUniqueId,
    });
  }

  const passengerRequest = await verifyExistanceOfData({
    tableName: "Requests",
    conditions: { requestUniqueId },
  });

  let passenger = { ...existedUser, ...passengerRequest[0] };
  return buildResponse({ passenger, driver, status: 1, decision });
};

// Process a new driver request
const handleNewDriverRequest = async (
  userUniqueId,
  requestUniqueId,
  existedUser
) => {
  let passenger = await findPassengerForDriver(userUniqueId);
  let decision = null;

  if (passenger) {
    decision = await handlePassengerFoundForDriver(passenger, {
      requestUniqueId,
      userUniqueId,
    });
  }

  const driverRequest = await verifyExistanceOfData({
    tableName: "Requests",
    conditions: { requestUniqueId },
  });

  let driver = { ...existedUser, ...driverRequest[0] };
  return buildResponse({ passenger, driver, status: 1, decision });
};

const handleDriverFoundForPassenger = async (driver, request) => {
  const status = 2; // 'requested'
  const driverPhoneNumber = driver?.phoneNumber;

  // Update the passenger's request status
  await updateData({
    tableName: "Requests",
    conditions: { requestUniqueId: request?.requestUniqueId },
    updateValues: { journeyStatusId: status },
  });

  // Insert data into JourneyDecisions table
  const journeyDecisionUniqueId = uuidv4();
  let decision = await insertData({
    tableName: "JourneyDecisions",
    colAndVal: {
      journeyDecisionUniqueId,
      passengerRequestId: request?.requestUniqueId,
      driverWaitId: driver?.requestUniqueId,
      journeyStatusId: status,
      decisionTime: new Date(),
    },
  });
  // get the decision data
  decision = verifyExistanceOfData({
    tableName: "JourneyDecisions",
    conditions: { journeyDecisionUniqueId },
  });
  decision = decision?.at(0);

  // Notify the driver
  await sendNotificationToDriver({
    message: { driver, request, decision },
    phoneNumber: driverPhoneNumber,
  });

  return decision;
};

// Process ongoing journey logic
const handleOngoingJourney = async (
  existedUser,
  existingRequest,
  requestType,
  requestUniqueId
) => {
  let decision = await verifyExistanceOfData({
    tableName: "JourneyDecisions",
    conditions:
      requestType === "PASSENGER"
        ? { passengerRequestId: requestUniqueId }
        : { driverWaitId: requestUniqueId },
  });
  decision = decision?.at(0);

  let otherUserRequest = await verifyExistanceOfData({
    tableName: "Requests",
    conditions:
      requestType === "PASSENGER"
        ? { requestUniqueId: decision?.driverWaitId }
        : { requestUniqueId: decision?.passengerRequestId },
  });

  let otherUser = await verifyExistanceOfData({
    tableName: "Users",
    conditions: { userUniqueId: otherUserRequest[0]?.userUniqueId },
  });

  let driver, passenger;
  if (requestType === "PASSENGER") {
    passenger = { ...existedUser, ...existingRequest };
    driver = { ...otherUser[0], ...otherUserRequest[0] };
  } else {
    driver = { ...existedUser, ...existingRequest };
    passenger = { ...otherUser[0], ...otherUserRequest[0] };
  }

  let journey = await getJourneyDetails(decision);
  journey = journey?.at(0);
  return buildResponse({
    passenger,
    driver,
    status: existingRequest.journeyStatusId,
    decision,
    journey,
  });
};

// start of getRequestById
const getRequestById = async (requestId) => {
  try {
    const result = await verifyExistanceOfData({
      tableName: "Requests",
      conditions: { requestId },
      operator: "AND",
    });
    return result[0];
  } catch (error) {
    throw new Error(`Error fetching request: ${error.message}`);
  }
};
// end of getRequestById
// start of updateRequest
const updateRequest = async (requestId, updateData) => {
  try {
    const result = await updateData({
      tableName: "Requests",
      updateValues: updateData,
      conditions: { requestId },
    });

    return result.affectedRows > 0
      ? { message: "success", data: "Request updated successfully" }
      : { message: "error", data: "Failed to update request" };
  } catch (error) {
    throw new Error(`Error updating request: ${error.message}`);
  }
};
// end of updateRequest
// start of deleteRequest
const deleteRequest = async (requestId) => {
  try {
    const result = await deleteData({
      tableName: "Requests",
      conditions: { requestId },
    });

    return result.affectedRows > 0
      ? { message: "success", data: "Request deleted successfully" }
      : { message: "error", data: "Failed to delete request" };
  } catch (error) {
    throw new Error(`Error deleting request: ${error.message}`);
  }
};
// end of deleteRequest
// module exports part
module.exports = {
  createRequest,
  getRequestById,
  updateRequest,
  deleteRequest,
};
