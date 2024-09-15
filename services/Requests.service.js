const { insertData } = require("../CRUD/Create/CreateData");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { updateData } = require("../CRUD/Update/Data.update");
const {
  getData,
  findPassengerForDriver,
  findDriverForPassenger,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");
const {
  sendNotificationToDriver,
  sendNotificationToPassenger,
} = require("../Utils/Notifications");

/**
 * Creates a new request for a user.
 *
 * @param {Object} body - The request body containing the request type.
 * @param {Object} user - The user object containing the user's unique ID.
 * @return {Object} An object containing the result of the request creation.
 */

// This code snippet creates a new request for a user in a ride-hailing system. It checks if the user exists and if they have an active request (in states 1, 2, 3, or 4). If they do, it handles the existing request; otherwise, it creates a new one.
const createRequest = async (body, user) => {
  try {
    const { userUniqueId } = user?.data;
    const { requestType } = body; // 'PASSENGER' or 'DRIVER'

    const existedUser = await getData({
      tableName: "Users",
      conditions: { userUniqueId },
    });
    if (!existedUser.length)
      return { message: "error", error: "User not found" };

    const activeRequest = await getData({
      tableName: "Requests",
      conditions: { userUniqueId, requestType, journeyStatusId: [1, 2, 3, 4] }, // Active states
    });

    return activeRequest.length
      ? await handleExistingRequest(
          activeRequest[0],
          existedUser[0],
          requestType
        )
      : await handleNewRequest(body, userUniqueId, existedUser[0], requestType);
  } catch (error) {
    console.error("@createRequest catch error", error);
    return { message: "error", error: "Unable to create request" };
  }
};

const handleExistingRequest = async (
  existingRequest,
  existedUser,
  requestType
) => {
  if (existingRequest.journeyStatusId === 1) {
    return requestType === "PASSENGER"
      ? await processPassengerRequest(existedUser, existingRequest)
      : await processDriverRequest(existedUser, existingRequest);
  }
  return await handleOngoingJourney(existedUser, existingRequest, requestType);
};
/** This code snippet defines an asynchronous function called `handleNewRequest`. It takes in three parameters: `body`, `userUniqueId`, and `requestType`.

// Inside the function, it first calls a function called `buildRequestPayload` to generate a `requestPayload` object. Then, it calls another function called `insertData` with the `Requests` table name and the `requestPayload` as arguments. The result of this operation is stored in a variable called `resultOfRegisterRequest`.

// After that, it checks if the `affectedRows` property of `resultOfRegisterRequest` is greater than 0. If it is, it calls either the `handleNewPassengerRequest` or `handleNewDriverRequest` function based on the value of `requestType`. These functions are not shown in the code snippet, but they likely handle the logic for handling new passenger or driver requests.

// If the `affectedRows` property is not greater than 0, it returns an object with a `message` property set to "error" and an `error` property set to "Unable to create request".

// Overall, this code snippet handles the creation of a new request by building the request payload, inserting it into the database, and handling the logic for new passenger or driver requests.


 * Handles the creation of a new request by building the request payload,
 * inserting it into the database, and handling the logic for new passenger or driver requests.
 *
 * @param {object} body - The request body containing relevant information.
 * @param {string} userUniqueId - The unique identifier of the user making the request.
 * @param {object} existedUser - The user object that already exists in the system.
 * @param {string} requestType - The type of request being made (PASSENGER or DRIVER).
 * @return {object} An object containing a message and error (if any) or the result of handling the new request.
 */
const handleNewRequest = async (
  body,
  userUniqueId,
  existedUser,
  requestType
) => {
  const requestPayload = buildRequestPayload(body, userUniqueId, requestType);
  const resultOfRegisterRequest = await insertData({
    tableName: "Requests",
    colAndVal: requestPayload,
  });

  if (resultOfRegisterRequest.affectedRows > 0) {
    return requestType === "PASSENGER"
      ? await handleNewPassengerRequest(
          userUniqueId,
          requestPayload.requestUniqueId,
          existedUser
        )
      : await handleNewDriverRequest(
          userUniqueId,
          requestPayload.requestUniqueId,
          existedUser
        );
  }
  return { message: "error", error: "Unable to create request" };
};

/** 
This function, `buildRequestPayload`, constructs a payload object for a new request based on the provided parameters. It determines whether the request is for a passenger or driver and sets the corresponding location fields (origin and destination) accordingly. The function returns an object containing the request information, including a unique request ID, user ID, vehicle type, location details, request time, request type, and initial journey status ('waiting').
 * Builds the payload for a new request based on the provided parameters.
 *
 * @param {object} body - The request body containing relevant information.
 * @param {string} userUniqueId - The unique identifier of the user making the request.
 * @param {string} requestType - The type of request being made (PASSENGER or DRIVER).
 * @return {object} The payload object containing the request information.
 */
const buildRequestPayload = (body, userUniqueId, requestType) => {
  const requestUniqueId = uuidv4();
  const isPassenger = requestType === "PASSENGER";
  const { originLocation, destination, vehicle, currentLocation } = body;

  return {
    requestUniqueId,
    userUniqueId,
    vehicleTypeId: vehicle.vehicleTypeId,
    originLatitude: isPassenger
      ? originLocation.latitude
      : currentLocation.latitude,
    originLongitude: isPassenger
      ? originLocation.longitude
      : currentLocation.longitude,
    originPlace: isPassenger
      ? originLocation.description
      : currentLocation.description,
    destinationLatitude: isPassenger ? destination.latitude : null,
    destinationLongitude: isPassenger ? destination.longitude : null,
    destinationPlace: isPassenger ? destination.description : null,
    requestTime: new Date(),
    requestType,
    journeyStatusId: 1, // Initial status: 'waiting'
  };
};

/** 
This function processes a passenger's request by finding a matching driver and handling the decision. It returns a response object containing the passenger's information, the matched driver's information, the current status of the journey, and the decision made (e.g., whether the driver accepted or rejected the request).
 * Process a passenger request by finding a matching driver and handling the decision.
 *
 * @param {object} existedUser - The existing user object.
 * @param {object} existingRequest - The existing request object.
 * @return {object} A response object containing the passenger, driver, status, and decision.
 */
const processPassengerRequest = async (existedUser, existingRequest) => {
  const driver = await findDriverForPassenger(existedUser.userUniqueId);
  const decision = driver
    ? await handleDriverFoundForPassenger(driver, existingRequest)
    : null;
  const passenger = { ...existedUser, ...existingRequest };
  return buildResponse({
    passenger,
    driver,
    status: existingRequest.journeyStatusId,
    decision,
  });
};

/** 
This function processes a driver's request by finding a matching passenger and handling the decision. It returns a response object containing the passenger's information, the driver's information, the current status of the journey, and the decision made.
 * Process a driver request by finding a matching passenger and handling the decision.
 *
 * @param {object} existedUser - The existing user object.
 * @param {object} existingRequest - The existing request object.
 * @return {object} A response object containing the passenger, driver, status, and decision.
 */
const processDriverRequest = async (existedUser, existingRequest) => {
  const passenger = await findPassengerForDriver(existedUser.userUniqueId);
  const decision = passenger
    ? await handlePassengerFoundForDriver(passenger, existingRequest)
    : null;
  const driver = { ...existedUser, ...existingRequest };
  return buildResponse({
    passenger,
    driver,
    status: existingRequest.journeyStatusId,
    decision,
  });
};

/**


This JavaScript function, `handleNewPassengerRequest`, handles the creation of a new passenger request by finding a matching driver, making a decision, and building a response object. It takes in the user's unique ID, the request's unique ID, and the existing user object. 

Here's what it does:

1. It finds a matching driver for the passenger using the `findDriverForPassenger` function.
2. If a driver is found, it makes a decision using the `handleDriverFoundForPassenger` function.
3. It retrieves the passenger's request data from the "Requests" table using the `getData` function.
4. It merges the existing user data with the request data to create a passenger object.
5. It builds a response object containing the passenger, driver, status (set to 1), and decision using the `buildResponse` function.

The function returns this response object.
 * Handles the creation of a new passenger request by finding a matching driver,
 * handling the decision, and building a response object.
 *
 * @param {string} userUniqueId - The unique identifier of the user making the request.
 * @param {string} requestUniqueId - The unique identifier of the request.
 * @param {object} existedUser - The existing user object.
 * @return {object} A response object containing the passenger, driver, status, and decision.
 */
const handleNewPassengerRequest = async (
  userUniqueId,
  requestUniqueId,
  existedUser
) => {
  const driver = await findDriverForPassenger(userUniqueId);
  const decision = driver
    ? await handleDriverFoundForPassenger(driver, {
        requestUniqueId,
        userUniqueId,
      })
    : null;
  const passengerRequest = await getData({
    tableName: "Requests",
    conditions: { requestUniqueId },
  });
  const passenger = { ...existedUser, ...passengerRequest[0] };
  return buildResponse({ passenger, driver, status: 1, decision });
};

/**


This JavaScript function, `handleNewDriverRequest`, handles a new driver request by finding a matching passenger, making a decision, and building a response object. It takes in the user's unique ID, the request's unique ID, and the existing user object. The function returns a response object containing the passenger's information, the driver's information, the current status of the journey, and the decision made.
 * Handles the creation of a new driver request by finding a matching passenger,
 * handling the decision, and building a response object.
 *
 * @param {string} userUniqueId - The unique identifier of the user making the request.
 * @param {string} requestUniqueId - The unique identifier of the request.
 * @param {object} existedUser - The existing user object.
 * @return {object} A response object containing the passenger, driver, status, and decision.
 */
const handleNewDriverRequest = async (
  userUniqueId,
  requestUniqueId,
  existedUser
) => {
  const passenger = await findPassengerForDriver(userUniqueId);
  const decision = passenger
    ? await handlePassengerFoundForDriver(passenger, {
        requestUniqueId,
        userUniqueId,
      })
    : null;
  const driverRequest = await getData({
    tableName: "Requests",
    conditions: { requestUniqueId },
  });
  const driver = { ...existedUser, ...driverRequest[0] };
  return buildResponse({ passenger, driver, status: 1, decision });
};

const handlePassengerFoundForDriver = async (passenger, request) => {
  return await handleFoundRequest(passenger, request, "Passenger");
};

/**

This JavaScript function, `handleDriverFoundForPassenger`, handles the decision when a driver is found for a passenger. It takes in the driver and request objects, and calls another function `handleFoundRequest` with the driver, request, and the string "Driver" as parameters. The function returns the result of `handleFoundRequest` as a decision object.
 * Handles the decision when a driver is found for a passenger.
 *
 * @param {object} driver - The driver object.
 * @param {object} request - The request object containing the requestUniqueId and userUniqueId.
 * @return {object} The decision object.
 */
const handleDriverFoundForPassenger = async (driver, request) => {
  return await handleFoundRequest(driver, request, "Driver");
};

/**


This JavaScript function, `handleFoundRequest`, handles a found request by updating the journey status, creating a new journey decision, retrieving the decision, and sending a notification to a specified role. It takes in a user object, a request object, and a role string, and returns the decision object.

Here's a step-by-step breakdown:

1. Set the journey status to "requested" (status = 2).
2. Generate a unique ID for the journey decision (journeyDecisionUniqueId).
3. Update the journey status using the `updateJourneyStatus` function.
4. Insert a new journey decision using the `insertJourneyDecision` function.
5. Retrieve the decision using the `getJourneyDecision` function.
6. Send a notification to the specified role using the `sendNotification` function.
7. Return the decision object.
 * Handles the found request by updating the journey status, inserting a new journey decision,
 * retrieving the decision, and sending a notification to the specified role.
 *
 * @param {object} user - The user object.
 * @param {object} request - The request object containing the requestUniqueId and userUniqueId.
 * @param {string} role - The role to which the notification will be sent.
 * @return {object} The decision object.
 */
const handleFoundRequest = async (user, request, role) => {
  const status = 2; // 'requested'
  const journeyDecisionUniqueId = uuidv4();
  await updateJourneyStatus(
    request?.requestUniqueId,
    status,
    user?.requestUniqueId
  );
  await insertJourneyDecision(
    request?.requestUniqueId,
    user?.requestUniqueId,
    journeyDecisionUniqueId,
    status
  );

  const decision = await getJourneyDecision(journeyDecisionUniqueId);
  await sendNotification(role, { user, request, decision });
  return decision;
};

/**
This code snippet defines an asynchronous function called `updateJourneyStatus` that updates the journey status for a given request. It takes in three parameters: `requestUniqueId` (the unique ID of the request to update), `status` (the new journey status), and `otherUserRequestUniqueId` (an optional unique ID of another user's request to update).

Inside the function, it calls another asynchronous function called `updateData` twice. The first call updates the journey status for the request specified by `requestUniqueId` to the new `status`. The second call, if `otherUserRequestUniqueId` is provided, updates the journey status for the request specified by `otherUserRequestUniqueId` to the new `status`.

The function returns a `Promise<void>`, indicating that it is an asynchronous function that does not return a value.

 * Updates the journey status for a given request and optionally for another user's request.
 *
 * @param {string} requestUniqueId - The unique ID of the request to update.
 * @param {number} status - The new journey status.
 * @param {string} [otherUserRequestUniqueId] - The unique ID of another user's request to update.
 * @return {Promise<void>}
 */
const updateJourneyStatus = async (
  requestUniqueId,
  status,
  otherUserRequestUniqueId
) => {
  await updateData({
    tableName: "Requests",
    conditions: { requestUniqueId },
    updateValues: { journeyStatusId: status },
  });
  if (otherUserRequestUniqueId) {
    await updateData({
      tableName: "Requests",
      conditions: { requestUniqueId: otherUserRequestUniqueId },
      updateValues: { journeyStatusId: status },
    });
  }
};

/**
This code snippet defines an asynchronous function called `insertJourneyDecision` that inserts a new journey decision into a database. It takes in four parameters: `passengerRequestId`, `driverWaitId`, `journeyDecisionUniqueId`, and `status`. It returns a promise that resolves to the inserted journey decision.

Inside the function, it calls another asynchronous function called `insertData` and passes an object as an argument. The object has two properties: `tableName` and `colAndVal`. `tableName` is set to "JourneyDecisions" and `colAndVal` is an object that contains the values to be inserted into the "JourneyDecisions" table. These values include `journeyDecisionUniqueId`, `passengerRequestId`, `driverWaitId`, `journeyStatusId`, and `decisionTime`. The `decisionTime` is set to the current date and time.

The `insertData` function is not shown in this code snippet, but it is assumed to be defined elsewhere and is responsible for performing the actual database insertion.

Overall, this code snippet provides a way to insert a new journey decision into a database, specifying the unique identifiers of the passenger request, driver waiting, and the journey decision, as well as the status of the journey.

 * Inserts a new journey decision into the database.
 *
 * @param {string} passengerRequestId - The unique identifier of the passenger request.
 * @param {string} driverWaitId - The unique identifier of the driver waiting.
 * @param {string} journeyDecisionUniqueId - The unique identifier of the journey decision.
 * @param {number} status - The status of the journey.
 * @return {Promise<Object>} A promise that resolves to the inserted journey decision.
 */
const insertJourneyDecision = async (
  passengerRequestId,
  driverWaitId,
  journeyDecisionUniqueId,
  status
) => {
  return await insertData({
    tableName: "JourneyDecisions",
    colAndVal: {
      journeyDecisionUniqueId,
      passengerRequestId,
      driverWaitId,
      journeyStatusId: status,
      decisionTime: new Date(),
    },
  });
};

/**


This function retrieves a journey decision from the database using its unique identifier. It calls `getData` to query the database, and returns the first matching decision object if found, or `undefined` if not.
 * Retrieves a journey decision from the database based on a unique identifier.
 *
 * @param {string} journeyDecisionUniqueId - The unique identifier of the journey decision.
 * @return {Object} The journey decision object if found, otherwise undefined.
 */
const getJourneyDecision = async (journeyDecisionUniqueId) => {
  const decision = await getData({
    tableName: "JourneyDecisions",
    conditions: { journeyDecisionUniqueId },
  });
  return decision?.at(0);
};

/**


This function sends a notification to a user based on their role. It takes in the user's role and an object containing the user, request, and decision data. It then sends the notification to either the driver or passenger using separate functions, `sendNotificationToDriver` or `sendNotificationToPassenger`, depending on the user's role.
 * Sends a notification to a user based on their role.
 *
 * @param {string} role - The role of the user, either "Driver" or "Passenger".
 * @param {Object} notificationData - An object containing the user, request, and decision data.
 * @param {Object} notificationData.user - The user object.
 * @param {Object} notificationData.request - The request object.
 * @param {Object} notificationData.decision - The decision object.
 * @return {Promise} A promise that resolves to the result of sending the notification.
 */
const sendNotification = async (role, { user, request, decision }) => {
  const phoneNumber = user?.phoneNumber;
  const message = { user, request, decision };
  return role === "Driver"
    ? await sendNotificationToDriver({ message, phoneNumber })
    : await sendNotificationToPassenger({ message, phoneNumber });
};
/**


This is a JavaScript function named `verifyStatusOfUser` that verifies the status of a user based on their latest request in a ride-hailing system. Here's a succinct explanation of what the function does:

1. It takes a request object `req` as input, which contains the user's data.
2. It fetches the latest request for the user from the database using a SQL query.
3. If no request is found, it returns a success message indicating that the user can make a new request.
4. If a request is found, it checks the request type (passenger or driver) and the journey status (waiting, requested, etc.).
5. Based on the status, it performs different actions:
	* If the status is waiting, it finds the other party (passenger or driver) and processes the request.
	* If the status is requested, it retrieves the journey decision and other user details.
6. It returns a response object containing the verification result, including a message and data.

The function uses various helper functions, such as `getJourneyDecisionByType`, `getOtherUser`, `mapUsersToRole`, and `buildResponse`, to perform the necessary actions. It also handles errors and returns a corresponding error message if any issues occur during the verification process.
 * Verifies the status of a user based on their latest request.
 *
 * @param {Object} req - The request object containing user data.
 * @return {Object} An object containing the verification result, including a message and data.
 */
const verifyStatusOfUser = async (req) => {
  try {
    const { userUniqueId } = req.user.data;

    // Fetch the latest request for the user
    const sqlToVerifyWaiting = `SELECT * FROM Users 
                                JOIN Requests ON Requests.userUniqueId = Users.userUniqueId 
                                WHERE Requests.userUniqueId = ? 
                                ORDER BY requestId DESC LIMIT 1`;
    const [userWaitResult] = await pool.query(sqlToVerifyWaiting, [
      userUniqueId,
    ]);

    if (userWaitResult?.length === 0) {
      return { message: "Success", data: "User can make a request" };
    }

    const requestType = userWaitResult[0]?.requestType; // Either 'PASSENGER' or 'DRIVER'
    const status = userWaitResult[0]?.journeyStatusId;
    const requestUniqueId = userWaitResult[0]?.requestUniqueId;

    // Check if the user is a passenger or a driver and handle accordingly
    if ([2, 3, 4].includes(status)) {
      const decision = await getJourneyDecisionByType(
        requestUniqueId,
        requestType
      );
      const otherUser = await getOtherUser(decision, requestType);
      const journey = await getJourneyDetails(decision);

      const { driver, passenger } = mapUsersToRole(
        userWaitResult[0],
        userWaitResult[0],
        otherUser,
        requestType
      );
      return buildResponse({ driver, passenger, status, decision, journey });
    }

    // If the status is 'waiting', find the other party (passenger/driver) and process
    if (status === 1) {
      const otherParty =
        requestType === "DRIVER"
          ? await findPassengerForDriver(userUniqueId)
          : await findDriverForPassenger(userUniqueId);

      if (!otherParty?.length) {
        return {
          message: "success",
          driver: requestType === "DRIVER" ? userWaitResult[0] : null,
          passenger: requestType === "PASSENGER" ? userWaitResult[0] : null,
          data: `${
            requestType === "DRIVER" ? "Passenger" : "Driver"
          } not found`,
        };
      }

      const journeyDecisionUniqueId = uuidv4();
      const registerDecision = await insertJourneyDecision(
        requestType === "PASSENGER"
          ? requestUniqueId
          : otherParty[0]?.requestUniqueId,
        requestType === "DRIVER"
          ? requestUniqueId
          : otherParty[0]?.requestUniqueId,
        journeyDecisionUniqueId,
        2 // 'requested' status
      );

      if (registerDecision?.message === "success") {
        await updateJourneyStatus(
          requestUniqueId,
          2,
          otherParty[0]?.requestUniqueId
        );
        return buildResponse({
          driver: requestType === "DRIVER" ? userWaitResult[0] : otherParty[0],
          passenger:
            requestType === "PASSENGER" ? userWaitResult[0] : otherParty[0],
          status: "requested",
          decision: registerDecision,
        });
      } else {
        return { message: "error", error: "Unable to register decision" };
      }
    }

    return { message: "success", data: "User can start a new journey" };
  } catch (error) {
    console.error("Error in verifyStatusOfUser:", error);
    return { message: "error", error: "Unable to verify current status" };
  }
};

const handleOngoingJourney = async (
  existedUser,
  existingRequest,
  requestType
) => {
  const decision = await getJourneyDecisionByType(
    existingRequest.requestUniqueId,
    requestType
  );
  const otherUser = await getOtherUser(decision, requestType);
  const journey = await getJourneyDetails(decision);

  const { driver, passenger } = mapUsersToRole(
    existedUser,
    existingRequest,
    otherUser,
    requestType
  );
  return buildResponse({
    driver,
    passenger,
    status: existingRequest.journeyStatusId,
    decision,
    journey,
  });
};

const getJourneyDecisionByType = async (requestUniqueId, requestType) => {
  const conditions =
    requestType === "PASSENGER"
      ? { passengerRequestId: requestUniqueId }
      : { driverWaitId: requestUniqueId };
  const decision = await getData({
    tableName: "JourneyDecisions",
    conditions,
  });
  return decision?.at(0);
};

const getOtherUser = async (decision, requestType) => {
  const otherUserRequestUniqueId =
    requestType === "PASSENGER"
      ? decision?.driverWaitId
      : decision?.passengerRequestId;
  return await performJoinSelect({
    baseTable: "Requests",
    joins: [
      { table: "Users", on: "Requests.userUniqueId = Users.userUniqueId" },
    ],
    conditions: { requestUniqueId: otherUserRequestUniqueId },
  });
};

const mapUsersToRole = (
  existedUser,
  existingRequest,
  otherUser,
  requestType
) => {
  return requestType === "PASSENGER"
    ? {
        driver: otherUser[0],
        passenger: { ...existedUser, ...existingRequest },
      }
    : {
        driver: { ...existedUser, ...existingRequest },
        passenger: otherUser[0],
      };
};

const getJourneyDetails = async (decision) => {
  const journeyDetails = await getData({
    tableName: "Journey",
    conditions: { journeyDecisionUniqueId: decision?.journeyDecisionUniqueId },
  });
  return journeyDetails?.at(0);
};

const buildResponse = ({ passenger, driver, status, decision, journey }) => {
  return { message: "success", passenger, driver, status, decision, journey };
};
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
const updateRequestById = async (requestId, updates) => {
  if (!requestId || !updates) {
    throw new Error("requestId and updates cannot be null or undefined");
  }
  try {
    const updateResult = await updateData({
      tableName: "Requests",
      updateValues: updates,
      conditions: { requestId },
    });

    if (!updateResult || updateResult.affectedRows === 0) {
      throw new Error("Failed to update request");
    }

    return { message: "success", data: "Request updated successfully" };
  } catch (error) {
    console.error("Error updating request:", error);
    return { message: "error", error: "Failed to update request" };
  }
};

/**
 * Retrieves a request by its ID.
 *
 * @param {number} requestId - The ID of the request to retrieve.
 * @returns {Promise<Object>} - A promise that resolves with the request object or undefined if not found.
 * @throws {Error} - If an error occurs while fetching the request.
 */
const getRequestById = async (requestId) => {
  try {
    const result = await getData({
      tableName: "Requests",
      conditions: { requestId },
      operator: "AND",
    });

    return result?.[0];
  } catch (error) {
    throw new Error(`Error fetching request: ${error.message}`);
  }
};
const cancelRequest = async (req) => {
  try {
    const body = req?.body;
    const {
      journeyDecisionUniqueId,
      passengerRequestUniqueId,
      driverWaitUniqueId,
      requestType,
    } = body;

    console.log("Request body: ", body);

    let journeyStatusId;
    const activeStatusIds = [1, 2, 3]; // List of active statuses

    // Determine journeyStatusId based on request type
    switch (requestType) {
      case "PASSENGER":
        journeyStatusId = 6; // Passenger cancel
        break;
      case "DRIVER":
        journeyStatusId = 7; // Driver cancel
        break;
      case "ADMIN":
        journeyStatusId = 8; // Admin cancel
        break;
      default:
        return { message: "error", error: "Invalid request type" };
    }

    // Helper function to update a table
    const updateJourneyStatus = async (tableName, conditions) => {
      return updateData({
        tableName,
        conditions: {
          ...conditions,
          journeyStatusId: activeStatusIds, // Make sure it's active status
        },
        updateValues: { journeyStatusId },
      });
    };

    // Collect all updates into an array for parallel execution
    const updates = [];

    if (journeyDecisionUniqueId) {
      updates.push(
        updateJourneyStatus("JourneyDecisions", { journeyDecisionUniqueId })
      );
      updates.push(updateJourneyStatus("Journey", { journeyDecisionUniqueId }));
    }

    if (passengerRequestUniqueId) {
      updates.push(
        updateJourneyStatus("Requests", {
          requestUniqueId: passengerRequestUniqueId,
        })
      );
    }

    if (driverWaitUniqueId) {
      updates.push(
        updateJourneyStatus("Requests", { requestUniqueId: driverWaitUniqueId })
      );
    }

    // Execute all updates in parallel
    const updateResults = await Promise.all(updates);

    // Check if any updates affected rows
    const hasUpdated = updateResults.some((result) => result?.affectedRows > 0);

    if (hasUpdated) {
      return {
        message: "success",
        data: "Request cancelled successfully",
        status: journeyStatusId,
      };
    } else {
      return { message: "error", error: "No data found to be canceled" };
    }
  } catch (error) {
    console.error("Error in cancelRequest:", error.message);
    return { message: "error", error: "Unable to cancel request" };
  }
}; // Exporting the functions
module.exports = {
  cancelRequest,
  createRequest,
  verifyStatusOfUser,
  getRequestById,
  updateRequestById,
  deleteRequest,
};
