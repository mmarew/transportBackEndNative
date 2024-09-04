const { insertData } = require("../CRUD/Create/CreateData");
const deleteData = require("../CRUD/Delete/deleteData");
const {
  verifyExistanceOfData,
  findDriverForPassenger,
  findPassengerForDriver,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");
const { v4: uuidv4 } = require("uuid");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  sendNotificationToDriver,
  sendNotificationToPassenger,
} = require("../Utils/Notifications");
const FindDriverForPassenger = require("../Utils/FindDriverToPassanger");
const { pool } = require("../Middleware/Database.config");
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
    decision = await handlePassengerFoundForDriver(passenger, existingRequest);
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
  console.log("status=========>", status);
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
  // update the driver's request status
  await updateData({
    tableName: "Requests",
    conditions: { requestUniqueId: driver?.requestUniqueId },
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
  decision = await verifyExistanceOfData({
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
const verifyStatusOfUser = async (req) => {
  try {
    const { userUniqueId } = req.user.data;

    // Fetch the latest request from the Requests table for the user
    const sqlToVerifyWaiting = `SELECT * FROM Users 
                                JOIN Requests ON Requests.userUniqueId = Users.userUniqueId 
                                WHERE Requests.userUniqueId = ? 
                                ORDER BY requestId DESC LIMIT 1`;
    const [userWaitResult] = await pool.query(sqlToVerifyWaiting, [
      userUniqueId,
    ]);

    let status = null,
      requestUniqueId = null,
      decision = null,
      driver = null,
      passenger = null,
      journey = null;

    if (userWaitResult?.length > 0) {
      status = userWaitResult[0]?.journeyStatusId;
      requestUniqueId = userWaitResult[0]?.requestUniqueId;
    } else {
      return { message: "Success", data: "User canmake a request" };
    }

    if (!status) {
      return { message: "error", error: "Unknown status of user" };
    }

    const requestType = userWaitResult[0]?.requestType; // Check if the user is a passenger or a driver

    // Handle statuses 2, 3, or 4
    if (status === 2 || status === 3 || status === 4) {
      const sqlToGetDecisionStatus = `SELECT * FROM JourneyDecisions 
                                      WHERE ${
                                        requestType === "DRIVER"
                                          ? "driverWaitId"
                                          : "passengerRequestId"
                                      } = ? 
                                      ORDER BY journeyDecisionId DESC LIMIT 1`;
      const [decisionRows] = await pool.query(
        sqlToGetDecisionStatus,
        requestUniqueId
      );
      const journeyDecisionUniqueId = decisionRows[0]?.journeyDecisionUniqueId;

      if (decisionRows?.length > 0) {
        decision = decisionRows[0];

        if (status === 4) {
          journey = await verifyExistanceOfData({
            tableName: "Journey",
            conditions: { journeyDecisionUniqueId },
          });
          journey = journey?.at(0);
        }

        const otherPartyRequestId =
          requestType === "DRIVER"
            ? decisionRows[0]?.passengerRequestId
            : decisionRows[0]?.driverWaitId;

        // Fetch the other party's request (Driver if user is passenger, Passenger if user is driver)
        const otherPartyRequest = await performJoinSelect({
          baseTable: "Users",
          joins: [
            {
              table: "Requests",
              on: "Requests.userUniqueId=Users.userUniqueId",
            },
          ],
          conditions: { "Requests.requestUniqueId": otherPartyRequestId },
        });

        if (!otherPartyRequest?.length) {
          return {
            message: "error",
            error: "Unable to get the other party's request data",
          };
        }

        if (requestType === "DRIVER") {
          passenger = otherPartyRequest[0]; // The other party is the passenger
          driver = userWaitResult[0]; // The current user is the driver
        } else {
          driver = otherPartyRequest[0]; // The other party is the driver
          passenger = userWaitResult[0]; // The current user is the passenger
        }

        const responseData = {
          message: "success",
          status,
          driver,
          passenger,
          decision,
          journey: journey || null,
        };
        return responseData;
      } else {
        return {
          message: "error",
          error: "No decision has been made yet",
        };
      }
    }

    // If the status is "waiting"
    else if (status === 1) {
      let otherParty = null;

      if (requestType === "DRIVER") {
        // Driver is waiting for a passenger
        otherParty = await findPassengerForDriver(userUniqueId);
      } else {
        // Passenger is waiting for a driver
        otherParty = await findDriverForPassenger(userUniqueId);
      }

      if (!otherParty?.length) {
        return {
          message: "success",
          status,
          driver: requestType === "DRIVER" ? userWaitResult[0] : null,
          passenger: requestType === "PASSENGER" ? userWaitResult[0] : null,
          decision: null,
          journey: journey || null,
          data: `${
            requestType === "DRIVER" ? "Passenger" : "Driver"
          } not found`,
        };
      }

      const otherPartyRequestUniqueId = otherParty[0]?.requestUniqueId;
      if (!otherPartyRequestUniqueId) {
        return {
          message: "error",
          error: "Unable to get the other party's details",
        };
      }

      const journeyDecisionUniqueId = uuidv4();
      const registerDecision = await insertData({
        tableName: "JourneyDecisions",
        colAndVal: {
          journeyDecisionUniqueId,
          passengerRequestId:
            requestType === "PASSENGER"
              ? requestUniqueId
              : otherPartyRequestUniqueId,
          driverWaitId:
            requestType === "DRIVER"
              ? requestUniqueId
              : otherPartyRequestUniqueId,
          journeyStatusId: 2,
          decisionTime: currentDate(),
        },
      });

      if (registerDecision?.message === "success") {
        // Update the status for both the user and the other party
        const waitingResult = await updateData({
          tableName: "Requests",
          conditions: { requestUniqueId },
          updateValues: { journeyStatusId: 2 },
        });

        const otherPartyResult = await updateData({
          tableName: "Requests",
          conditions: { requestUniqueId: otherPartyRequestUniqueId },
          updateValues: { journeyStatusId: 2 },
        });

        if (
          waitingResult.affectedRows === 0 ||
          otherPartyResult.affectedRows === 0
        ) {
          return {
            message: "error",
            error: "Unable to update the request status",
          };
        }

        return {
          message: "success",
          status: "requested",
          driver: requestType === "DRIVER" ? userWaitResult[0] : otherParty[0],
          passenger:
            requestType === "PASSENGER" ? userWaitResult[0] : otherParty[0],
          decision: registerDecision,
          journey: journey || "",
        };
      } else {
        return { message: "error", error: "Unable to register decision" };
      }
    } else {
      return { message: "success", data: "User can start job" };
    }
  } catch (error) {
    console.error("Error in verifyStatusOfUser:", error);
    return { message: "error", error: "Unable to verify current status" };
  }
};

// module exports part
module.exports = {
  verifyStatusOfUser,
  createRequest,
  getRequestById,
  updateRequest,
  deleteRequest,
};
