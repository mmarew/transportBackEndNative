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
const { updateUserRoleStatus } = require("./UserRoleStatus.service");

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
const acceptPassengerRequest = async (body, userUniqueId) => {
  const existingRequest = await getData({
    tableName: "DriverRequest",
    conditions: { driverRequestUniqueId: body.driverRequestUniqueId },
  });
  console.log("existingRequest", existingRequest);
  const journeyStatusId = existingRequest[0].journeyStatusId;
  if (journeyStatusId === 2) await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId: body.userUniqueId,
  });
  const passenger = message?.passenger;
  const phoneNumber = passenger?.phoneNumber;
  if (phoneNumber && journeyStatusId === 2)
    sendNotificationToPassenger({
      message,
      phoneNumber,
    });

  return message;
};
const startJourney = async (body) => {
  console.log("/driver/startJourney", body);
  const journeyUniqueId = uuidv4();
  // check if driver has active journey request by journeyDecisionUniqueId,
  const exisistingJourney = await getData({
    tableName: "Journey",
    conditions: { journeyDecisionUniqueId: body.journeyDecisionUniqueId },
  });
  // console.log("exisistingJourney", exisistingJourney);
  // return;
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
  const passengerRequestUniqueId = body.passengerRequestUniqueId;

  const existingRequest = await getData({
    tableName: "DriverRequest",
    conditions: { driverRequestUniqueId: body.driverRequestUniqueId },
  });
  console.log("===============>", existingRequest);
  const journeyStatusId = existingRequest[0]?.journeyStatusId;

  const passenger = await performJoinSelect({
    baseTable: "PassengerRequest",
    joins: [
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { passengerRequestUniqueId },
  });
  const userUniqueId = body.userUniqueId;
  await updateJourneyStatus(body);
  const message = await verifyDriverStatus({
    userUniqueId,
  });
  if (journeyStatusId == 4) {
    sendNotificationToPassenger({
      message: { message: "success", data: "Journey completed", status: 5 },
      phoneNumber: passenger[0]?.phoneNumber,
    });
  }

  return message;
};

const canceledByDriver = async (body) => {
  const passengerRequestUniqueId = body.passengerRequestUniqueId;
  const existingRequest = await getData({
    tableName: "DriverRequest",
    conditions: { driverRequestUniqueId: body.driverRequestUniqueId },
  });
  const journeyStatusId = existingRequest[0]?.journeyStatusId;

  const userUniqueId = body.userUniqueId;
  const passenger = await performJoinSelect({
    baseTable: "PassengerRequest",
    joins: [
      {
        table: "Users",
        on: "PassengerRequest.userUniqueId = Users.userUniqueId",
      },
    ],
    conditions: { passengerRequestUniqueId },
  });
  if ([1, 2, 3, 4].includes(journeyStatusId)) {
    await updateJourneyStatus(body);
  }

  const message = await verifyDriverStatus({
    userUniqueId,
  });
  if ([1, 2, 3, 4].includes(journeyStatusId)) {
    sendNotificationToPassenger({
      message: {
        message: "success",
        data: "Journey canceled by driver",
        status: 7,
      },
      phoneNumber: passenger[0]?.phoneNumber,
    });
  }

  return message;
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
        journeyStatusId: previousStatusId,
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
        journeyStatusId: previousStatusId,
      },
      updateValues: {
        journeyStatusId,
      },
    });
  }

  if (driverRequestUniqueId) {
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestUniqueId, journeyStatusId: previousStatusId },
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
    console.log("driverRequest", driverRequest);
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
const driversRequirement = async (body) => {
  const ownerUserUniqueId = body.ownerUserUniqueId;
  const userRoleStatusUniqueId = body.userRoleStatusUniqueId;
  const user = body.user;
  const roleId = body.roleId;
  const userRoleId = body.userRoleId;
  const userRoleStatusDescription = body.userRoleStatusDescription;
  const phoneNumber = body.phoneNumber;

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

  if (requiredDocuments.length === 0) {
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
    attachedDocumentsByStatus[documentStatus].push(attachedDocument);
  });

  // Check vehicle registration for the driver role
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

  // Determine the appropriate status based on documents and vehicle
  let finalStatusId = null;
  // console.log("vehicleRegistered", vehicleRegistered);
  // return;
  // If the vehicle is registered
  if (vehicleRegistered) {
    if (unAttachedDocumentTypes.length === 0) {
      // All documents attached
      if (
        attachedDocumentsByStatus.ACCEPTED.length === requiredDocuments.length
      ) {
        finalStatusId = 1; // "active"
      } else if (
        attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
      ) {
        finalStatusId = 14; // "inactive - all documents rejected, vehicle registered"
      } else if (
        attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
      ) {
        finalStatusId = 13; // "inactive - all documents pending, vehicle registered"
      } else if (
        attachedDocumentsByStatus.ACCEPTED.length > 0 &&
        attachedDocumentsByStatus.PENDING.length > 0
      ) {
        finalStatusId = 11; // "inactive - some documents accepted, some pending, vehicle registered"
      } else if (
        attachedDocumentsByStatus.ACCEPTED.length > 0 &&
        attachedDocumentsByStatus.REJECTED.length > 0
      ) {
        finalStatusId = 12; // "inactive - some documents accepted, some rejected, vehicle registered"
      } else {
        finalStatusId = 19; // "inactive - documents have mixed statuses, vehicle registered"
      }
    } else {
      finalStatusId = 17; // "inactive - some documents not attached, vehicle registered"
    }
  } else {
    // If the vehicle is not registered
    if (unAttachedDocumentTypes.length === 0) {
      // All documents attached
      if (
        attachedDocumentsByStatus.ACCEPTED.length === requiredDocuments.length
      ) {
        finalStatusId = 7; // "inactive - all documents accepted, vehicle not registered"
      } else if (
        attachedDocumentsByStatus.REJECTED.length === requiredDocuments.length
      ) {
        finalStatusId = 16; // "inactive - all documents rejected, vehicle not registered"
      } else if (
        attachedDocumentsByStatus.PENDING.length === requiredDocuments.length
      ) {
        finalStatusId = 15; // "inactive - all documents pending, vehicle not registered"
      } else if (
        attachedDocumentsByStatus.ACCEPTED.length > 0 &&
        attachedDocumentsByStatus.PENDING.length > 0
      ) {
        finalStatusId = 6; // "inactive - some documents accepted, some pending, vehicle not registered"
      } else if (
        attachedDocumentsByStatus.ACCEPTED.length > 0 &&
        attachedDocumentsByStatus.REJECTED.length > 0
      ) {
        finalStatusId = 5; // "inactive - some documents accepted, some rejected, vehicle not registered"
      } else {
        finalStatusId = 20; // "inactive - documents have mixed statuses, vehicle not registered"
      }
    } else {
      finalStatusId = 18; // "inactive - some documents not attached, vehicle not registered"
    }
  }

  // Update the user's role status based on the determined final status
  let updatedUserData = await updateUserRoleStatus({
    user,
    roleId,
    userRoleStatusUniqueId,
    userRoleId,
    newStatusId: finalStatusId,
    userRoleStatusDescription,
    phoneNumber,
  });

  sendNotificationToAdmin({});

  return {
    message: "success",
    userVehicle: userVehicle[0],
    userData: updatedUserData?.userData[0],
    attachedDocumentsByStatus,
    unAttachedDocumentTypes, // Documents that are required but not attached
  };
};

module.exports = {
  driversRequirement,
  attachRequiredDocuments,
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
