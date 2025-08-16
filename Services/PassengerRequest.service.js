// services/Passenger.service.js
const {
  getData,
  checkActivePassengerRequest,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");
const { createCanceledJourney } = require("./CanceledJourneys.service");
const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");
const { createNewPassengerRequest } = require("../CRUD/Create/CreateData");

const { sendNotificationToDriver } = require("../Utils/Notifications");

const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");
const { updateJourneyStatus } = require("./JourneyStatus.service");
const {
  verifyPassengerStatus,
  verifyDriverStatus,
} = require("./UsersCurrentStatus");
require("./AttachedDocuments.service");

const createPassengerRequest = async (body, user, journeyStatusId) => {
  try {
    const { userUniqueId } = user;
    const numberOfVehicles = body?.numberOfVehicles || 1;
    // first check if the user has an active request based on passengerRequestBatchId
    const passengerRequestBatchId = body?.passengerRequestBatchId;
    const dataByBatchId = await getData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestBatchId, userUniqueId },
    });
    console.log(
      "@dataByBatchId",
      dataByBatchId.length,
      "numberOfVehicles",
      numberOfVehicles
    );
    if (dataByBatchId?.length >= numberOfVehicles) {
      return {
        message: "error",
        error: "You already have an active request with this batch ID.",
      };
    }
    const noOfRecords = numberOfVehicles - dataByBatchId?.length;
    for (let i = 0; i < noOfRecords; i++) {
      await createNewPassengerRequest(body, userUniqueId, journeyStatusId);
      // const newRequest = await createNewPassengerRequest(
      //   body,
      //   userUniqueId,
      //   journeyStatusId
      // );
    }
    return await verifyPassengerStatus({
      userUniqueId,
      activeRequest: null, // newRequest?.data,
      sendNotificationsToDrivers: true,
    });
  } catch (error) {
    console.log("Error in createRequest:", error);
    return { message: "error", error: "Unable to create request" };
  }
};
const acceptDriverRequest = async (body) => {
  try {
    const userUniqueId = body?.userUniqueId;
    const driverRequestUniqueId = body?.driverRequestUniqueId;
    const journeyDecisionUniqueId = body?.journeyDecisionUniqueId;

    const statusData = await verifyPassengerStatus({
      userUniqueId,
      sendNotificationsToDrivers: false,
    });
    console.log(
      "@acceptDriverRequest statusData?.drivers",
      statusData?.drivers
    );
    // multiple drivers
    const acceptedDriver = [];
    const decisions = statusData?.decisions;
    // find accepted decision from the decisions array
    const acceptedDecision = decisions?.find(
      (decision) => decision.journeyDecisionUniqueId == journeyDecisionUniqueId
    );
    console.log("@acceptedDecision", acceptedDecision);
    // return;
    const drivers = statusData?.drivers;

    for (let i = 0; i < drivers?.length; i++) {
      const driver = drivers[i];
      const phoneNumber = driver?.driver?.phoneNumber;

      if (driverRequestUniqueId != driver.driver.driverRequestUniqueId) {
        body.journeyStatusId = journeyStatusMap.rejectedByPassenger;
      } else {
        acceptedDriver[0] = driver;
        body.journeyStatusId = journeyStatusMap.acceptedByPassenger;
        // update only accepted driver request
        await updateJourneyStatus(body);
      }
      console.log("@ body.journeyStatusId", body.journeyStatusId);
      // return;
      // await updateJourneyStatus(body);
      const driverStatus = await verifyDriverStatus({
        userUniqueId: driver?.driver?.userUniqueId,
      });
      console.log("@driverStatus", driverStatus);
      if (driverStatus?.message == "success") {
        sendNotificationToDriver({ message: driverStatus, phoneNumber });
      } else if (driverStatus?.message == "error") {
        console.log(
          "Error in sending notification to driver. driverStatus is :",
          driverStatus
        );
      }
    }
    // return passenger status after journey status data is updated like above
    return await verifyPassengerStatus({ userUniqueId });
  } catch (error) {
    console.log("@acceptDriverRequest error", error);
    return { message: "error", error: "unable to accept driver request" };
  }
};
const getAllActiveRequests = async () => {
  const activeStatusIds = [
    journeyStatusMap.requested,
    journeyStatusMap.waiting,
    journeyStatusMap.acceptedByDriver,
  ];

  const sql = `
    SELECT pr.*, u.* 
    FROM PassengerRequest pr
    JOIN Users u ON u.userUniqueId = pr.userUniqueId 
    WHERE pr.journeyStatusId IN (?)
  `;

  try {
    const [results] = await pool.query(sql, [activeStatusIds]);
    return {
      status: "success",
      data: results,
      count: results.length,
    };
  } catch (error) {
    console.error("Failed to fetch active requests:", error);
    return {
      status: "error",
      error: "Unable to retrieve active ride requests",
      details:
        process.env.NODE_ENV === "development" ? error.message : undefined,
    };
  }
};
const getPassengerRequestByPassengerRequestId = async (passengerRequestId) => {
  try {
    const result = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { passengerRequestId },
    });
    return { message: "success", data: result[0] };
  } catch (error) {
    console.log(
      "@error on getPassengerRequestByPassengerRequestId error is",
      error
    );
    return { message: "error", error: "unable to get data" };
  }
};
const getPassengerRequestByPassengerRequestUniqueId = async (
  passengerRequestUniqueId
) => {
  try {
    const result = await performJoinSelect({
      baseTable: "PassengerRequest",
      joins: [
        {
          table: "Users",
          on: "PassengerRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: {
        passengerRequestUniqueId,
      },
    });

    if (!result?.length) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    console.log("Error in getRequestById:", error);
    return { message: "error", error: "Unable to retrieve request" };
  }
};

const updateRequestById = async (requestId, updates) => {
  try {
    const result = await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: requestId },
      updateValues: updates,
    });

    if (result.affectedRows === 0) {
      return {
        message: "error",
        error: "Request not found or no changes made",
      };
    }

    return { message: "success", data: "Request updated successfully" };
  } catch (error) {
    console.log("Error in updateRequestById:", error);
    return { message: "error", error: "Unable to update request" };
  }
};

const deleteRequest = async (requestId) => {
  try {
    const result = await deleteData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: requestId },
    });

    if (result.affectedRows === 0) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: "Request deleted successfully" };
  } catch (error) {
    console.log("Error in deleteRequest:", error);
    return { message: "error", error: "Unable to delete request" };
  }
};

const cancelPassengerRequest = async (body) => {
  try {
    const user = body?.user;
    const roleId = user?.roleId;
    const ownerUserUniqueId = body?.ownerUserUniqueId,
      driverUserUniqueId = body?.driverUserUniqueId,
      cancellationReasonsTypeId = body?.cancellationReasonsTypeId;
    const { userUniqueId } = user;
    // Check if the user has any active passenger requests
    const getActiveRequest = await checkActivePassengerRequest(
      ownerUserUniqueId
    );

    if (getActiveRequest.length == 0) {
      return {
        message: "error",
        error: "No active requests found for this user",
      };
    }

    const passengerRequestId = getActiveRequest?.[0]?.passengerRequestId;

    const journeyStatusId =
      roleId == 1
        ? journeyStatusMap.cancelledByPassenger
        : roleId == 3
        ? journeyStatusMap.cancelledByAdmin
        : journeyStatusMap.cancelledBySystem;

    // Update the PassengerRequest to reflect the cancellation
    await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId },
      // 6 is canceled by passenger, 7 is canceled by driver, 8 is canceled by admin, 10 is canceled by system
      updateValues: {
        journeyStatusId,
      },
    });

    // Check if the request exists in JourneyDecisions
    const journeyDecisions = await getData({
      tableName: "JourneyDecisions",
      conditions: { passengerRequestId },
    });

    if (journeyDecisions.length == 0) {
      // register cancillation data on CanceledJourney
      const canceledJourney = await createCanceledJourney({
        canceledBy: userUniqueId,
        canceledTime: null,
        contextId: passengerRequestId,
        contextType: "PassengerRequest",
        cancellationReasonsTypeId,
        roleId,
        driverUserUniqueId,
        passengerUserUniqueId: ownerUserUniqueId,
      });
      // If there's no journey decision related to this request and cancellation is successfully registered, return success
      if (canceledJourney.message === "success")
        return {
          status: null,
          message: "success",
          data: "You have successfully cancelled your request.",
        };
    }

    const driverRequestId = journeyDecisions?.[0].driverRequestId;
    const journeyDecisionUniqueId =
      journeyDecisions?.[0].journeyDecisionUniqueId;
    const journeyDecisionId = journeyDecisions?.[0].journeyDecisionId;

    // Update the DriverRequest to reflect the cancellation
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestId },
      updateValues: { journeyStatusId }, // Set journeyStatusId to 6 (cancelled by passenger)
    });
    const driverData = await performJoinSelect({
      baseTable: "DriverRequest",
      joins: [
        {
          table: "Users",
          on: "DriverRequest.userUniqueId = Users.userUniqueId",
        },
      ],
      conditions: { driverRequestId },
    });
    const driver = driverData?.[0];
    const phoneNumber = driver?.phoneNumber;
    await sendNotificationToDriver({
      message: {
        passenger: null,
        driver: null,
        journey: null,
        decisions: null,
        status: journeyStatusId,
        // userUniqueId === ownerUserUniqueId
        //   ? journeyStatusMap?.cancelledByPassenger // "passenger cancelled your request."
        //   : journeyStatusMap?.cancelledBySystem, //"system cancelled your request.",
        message: "success",
        data:
          userUniqueId === ownerUserUniqueId
            ? "passenger cancelled your request."
            : "system cancelled your request.",
      },
      phoneNumber,
    });

    // Update JourneyDecisions to reflect the cancellation
    await updateData({
      tableName: "JourneyDecisions",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId }, // Set journeyStatusId to 6 (cancelled by passenger)
    });
    const existingJourneyData = await getData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
    });
    // Update the Journey table (if the journey had already started)
    const updatedJourneyData = await updateData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId },
    });
    const journeyId = existingJourneyData.at(0)?.journeyId;
    const canceledJourney = await createCanceledJourney({
      canceledBy: userUniqueId,
      canceledTime: null,
      contextId: journeyId ? journeyId : journeyDecisionId,
      contextType: journeyId ? "Journey" : "JourneyDecisions",
      cancellationReasonsTypeId,
      roleId,
      driverUserUniqueId,
      passengerUserUniqueId: ownerUserUniqueId,
    });
    console.log("canceledJourney", canceledJourney);

    return {
      status: null,
      message: "success",
      data: "You have successfully cancelled your request.",
    };
  } catch (error) {
    console.log("@cancelPassengerRequest error", error);
    return { message: "error", error: "Unable to cancel passenger request" };
  }
};

// Function to get the passenger's current journey status
const getPassengerJourneyStatus = async (userUniqueId) => {
  try {
    const [currentRequest] = await getData({
      tableName: "PassengerRequest",
      conditions: { userUniqueId },
      limit: 1,
      orderBy: "passengerRequestId",
      orderDirection: "desc",
    });

    const journeyStatusId = currentRequest?.journeyStatusId;
    return journeyStatusId && journeyStatusId <= journeyStatusMap.journeyStarted
      ? journeyStatusId
      : null;
  } catch (error) {
    console.log("Error in getPassengerJourneyStatus:", error);
    return null;
  }
};
const getRecentCompletedJourney = async (user) => {
  console.log("@user", user);
  const userUniqueId = user?.userUniqueId;
  const results = await getData({
    tableName: "PassengerRequest",
    conditions: { userUniqueId },
    limit: 7,
    orderBy: "passengerRequestId",
    orderDirection: "desc",
  });
  return { message: "success", data: results };
};
module.exports = {
  getRecentCompletedJourney,
  acceptDriverRequest,
  getAllActiveRequests,
  getPassengerJourneyStatus,
  cancelPassengerRequest,
  createPassengerRequest,
  getPassengerRequestByPassengerRequestUniqueId,
  updateRequestById,
  deleteRequest,
  getPassengerRequestByPassengerRequestId,
};
