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
} = require("../CRUD/Create/CreateData");

const { v4: uuidv4 } = require("uuid");
const {
  sendNotificationToPassenger,
  sendNotificationToAdmin,
} = require("../Utils/Notifications");
const {
  updateUserRoleStatus,
  getUserRoleStatus,
} = require("./UserRoleStatus.service");

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
  const userUniqueId = body.userUniqueId;
  const existingRequest = await getData({
    tableName: "DriverRequest",
    conditions: { driverRequestUniqueId: body.driverRequestUniqueId },
  });
  if (!existingRequest?.length)
    return { message: "error", error: "Request not found" };
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
  // check if driver has active journey request by journeyDecisionUniqueId,
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
    await updateJourneyStatus(body);
  }
  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = message.passenger;
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
  await updateJourneyStatus(body);

  return {
    message: "success",
    data: "Journey completed successfully",
    status: 5,
  };
};

const cancelDriverRequest = async (body) => {
  try {
    const user = body.user;
    const userUniqueId = user?.userUniqueId;
    const ownerUserUniqueId = body.ownerUserUniqueId;

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
      return {
        message: "success",
        data: "You have successfully cancelled your request.",
      };
    }

    const passengerRequestId = journeyDecisions[0].passengerRequestId;
    const journeyDecisionUniqueId = journeyDecisions[0].journeyDecisionUniqueId;

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

    // Update the Journey table (if the journey had already started)
    await updateData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId: 7 }, // Set journeyStatusId to 7 (cancelled by driver)
    });

    return {
      message: "success",
      data: "You have successfully cancelled your request.",
    };
  } catch (error) {
    console.error("Error cancelling driver request:", error);
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
    console.error("Error in deleteDriverRequest:", error);
    return { message: "error", error: "Unable to delete request" };
  }
};

const verifyDriverStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // Step 1: Check if the driver has a vehicle
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

    if (!vehicle || vehicle.length === 0) {
      return {
        message: "error",
        error: "No vehicle found for this driver",
        status: null,
      };
    }

    const vehicleTypeUniqueId = vehicle[0].vehicleTypeUniqueId;

    // Step 2: If no activeRequest, check for an active driver request
    if (!activeRequest || activeRequest.length === 0) {
      activeRequest = await checkActiveDriverRequest(userUniqueId);
    }

    if (!activeRequest || activeRequest.length === 0) {
      return {
        message: "success",
        data: "No active requests found for this driver",
        status: null,
        vehicle: vehicle[0],
      };
    }
    // active  request are between 1 and 4
    if (activeRequest[0].journeyStatusId > 4) {
      return {
        message: "success",
        data: "This request is not active at the moment",
        status: null,
        vehicle: vehicle[0],
        driver: null,
      };
    }
    const driverRequest = activeRequest[0];
    const journeyStatusId = driverRequest.journeyStatusId;

    // Step 3: Fetch driver details
    const arrayDriverData = await performJoinSelect({
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
    });
    const driver = arrayDriverData[0];
    // Step 4: If journey status is "waiting" (1), search for nearby passengers
    if (journeyStatusId === 1) {
      const { originLatitude, originLongitude } = driverRequest;
      const nearbyPassengers = await findNearbyPassengers({
        originLatitude,
        originLongitude,
        vehicleTypeUniqueId,
      });

      if (!nearbyPassengers || nearbyPassengers.length === 0) {
        return {
          message: "success",
          status: 1, // Waiting
          driver,
          vehicle: vehicle[0],
          passenger: null,
          journey: null,
          decisions: null,
        };
      }

      // Step 5: Passenger found, create journey decision
      const passenger = nearbyPassengers[0];
      const journeyDecisionUniqueId = uuidv4();
      const journeyDecisionPayload = {
        journeyDecisionUniqueId,
        passengerRequestId: passenger.passengerRequestId,
        driverRequestId: driverRequest.driverRequestId,
        journeyStatusId: 2, // Requested status
        decisionTime: new Date(),
      };

      // Batch insert/update operations for consistency
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

      // Step 6: Notify passenger and return response
      const message = {
        driver,
        vehicle: vehicle[0],
        passenger,
        journey: null,
        decisions: journeyDecisionPayload,
      };
      const phoneNumber = passenger?.phoneNumber;
      if (phoneNumber) {
        await sendNotificationToPassenger({ message, phoneNumber });
      }

      return {
        message: "success",
        status: 2, //passenger found and  Requested
        ...message,
      };
    }

    // Step 7: If journeyStatusId is not 1, fetch existing journey and decision data
    const [journeyDecision] = await getData({
      tableName: "JourneyDecisions",
      conditions: { driverRequestId: driverRequest.driverRequestId },
    });
    const [journey] = await getData({
      tableName: "Journey",
      conditions: {
        journeyDecisionUniqueId: journeyDecision.journeyDecisionUniqueId,
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
      conditions: { passengerRequestId: journeyDecision.passengerRequestId },
    });
    const passenger = passengerData[0];

    // Step 8: Return response with driver, passenger, journey, and decisions
    const responseMessage = {
      status: journeyStatusId,
      driver,
      vehicle: vehicle[0],
      passenger: passenger || null,
      journey: journey || null,
      decisions: journeyDecision || null,
    };

    const phoneNumber = passenger?.phoneNumber;
    if (phoneNumber) {
      await sendNotificationToPassenger({
        message: responseMessage,
        phoneNumber,
      });
    }

    return {
      message: "success",
      status: passenger?.journeyStatusId || journeyStatusId,
      ...responseMessage,
    };
  } catch (error) {
    console.error("Error in verifyDriverStatus:", error);
    return { message: "error", error: "Unable to verify driver status" };
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
    console.error("Error in attachRequiredDocuments:", error);
    return { message: "error", error: "Unable to attach required documents" };
  }
};
const driversDocumentVehicleRequirement = async (body) => {
  const ownerUserUniqueId = body.ownerUserUniqueId;
  const user = body.user;
  const roleId = body.roleId;
  const phoneNumber = user.phoneNumber;
  const userRoleStatusDescription = body.userRoleStatusDescription;

  // Fetch initial user data based on role ID and phone number
  let userData = await getUserRoleStatus({ roleId, phoneNumber });
  if (!userData || userData.length === 0) {
    return { message: "error", data: "User data not found" };
  }

  const { userRoleStatusUniqueId, userRoleId, statusId } = userData[0];

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

  // Fetch attached documents for the driver
  const attachedDocuments = await getData({
    tableName: "AttachedDocuments",
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

    const updatedUserData = await updateUserRoleStatus(userRoleStatusData);
    if (updatedUserData && updatedUserData.length > 0) {
      userData = updatedUserData; // Only update userData if update was successful
    }
  } else {
  }


  return {
    message: "success",
    userVehicle: userVehicle[0] || null,
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
  getDriverRequestById,
  acceptPassengerRequest,
  deleteDriverRequest,
  verifyDriverStatus,
  cancelDriverRequest,
};
