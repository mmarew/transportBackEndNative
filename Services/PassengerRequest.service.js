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
    const newRequest = await createNewPassengerRequest(
      body,
      userUniqueId,
      journeyStatusId
    );
    return await verifyPassengerStatus({
      userUniqueId,
      activeRequest: newRequest?.data,
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

    const statusData = await verifyPassengerStatus({ userUniqueId });
    console.log("@statusData", statusData);
    // multiple drivers
    const acceptedDriver = [];
    const decisions = statusData?.decisions;

    const acceptedDecision = decisions?.find(
      (decision) => decision.journeyDecisionUniqueId == journeyDecisionUniqueId
    );
    console.log("@acceptedDecision", acceptedDecision);
    const drivers = statusData?.drivers;
    for (let i = 0; i < drivers?.length; i++) {
      const driver = drivers[i];
      const phoneNumber = driver?.driver?.phoneNumber;

      console.log("@acceptDriverRequest driver", driver);

      if (driverRequestUniqueId != driver.driver.driverRequestUniqueId) {
        body.journeyStatusId = journeyStatusMap.rejectedByPassenger;
      } else {
        acceptedDriver[0] = driver;
        body.journeyStatusId = journeyStatusMap.acceptedByPassenger;
      }

      await updateJourneyStatus(body);
      const driverStatus = verifyDriverStatus({
        userUniqueId: driver?.userUniqueId,
      });
      sendNotificationToDriver({ message: driverStatus, phoneNumber });
    }
    return await verifyPassengerStatus({ userUniqueId });
  } catch (error) {
    console.log("@acceptDriverRequest error", error);
    return { message: "error", error: "unable to accept driver request" };
  }
};
const getAllActiveRequests = async () => {
  try {
    const sqlToGetActiveData = `select * from PassengerRequest where journeyStatusId=? or journeyStatusId=?`;
    const values = [1, 2];
    const [results] = await pool.query(sqlToGetActiveData, values);
    return { message: "success", data: results };
  } catch (error) {
    console.log("@error", error);
    return { error: "unable to get data", message: "error" };
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
    const user = body.user;
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

    const passengerRequestId = getActiveRequest[0].passengerRequestId;

    // Update the PassengerRequest to reflect the cancellation
    await updateData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId },
      // 6 is canceled by passenger, 7 is canceled by driver, 8 is canceled by admin, 10 is canceled by system
      updateValues: {
        journeyStatusId:
          roleId == 1
            ? journeyStatusMap.cancelledByPassenger
            : roleId == 3
            ? journeyStatusMap.cancelledByAdmin
            : journeyStatusMap.cancelledBySystem,
      }, // Set journeyStatusId to 6 (cancelled by passenger)
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

    const driverRequestId = journeyDecisions[0].driverRequestId;
    const journeyDecisionUniqueId = journeyDecisions[0].journeyDecisionUniqueId;
    const journeyDecisionId = journeyDecisions[0].journeyDecisionId;

    // Update the DriverRequest to reflect the cancellation
    await updateData({
      tableName: "DriverRequest",
      conditions: { driverRequestId },
      updateValues: { journeyStatusId: journeyStatusMap.cancelledByPassenger }, // Set journeyStatusId to 6 (cancelled by passenger)
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
    const driver = driverData[0];
    const phoneNumber = driver?.phoneNumber;
    await sendNotificationToDriver({
      message: {
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
      updateValues: { journeyStatusId: journeyStatusMap.cancelledByPassenger }, // Set journeyStatusId to 6 (cancelled by passenger)
    });
    const existingJourneyData = await getData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
    });
    // Update the Journey table (if the journey had already started)
    const updatedJourneyData = await updateData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
      updateValues: { journeyStatusId: 6 }, // Set journeyStatusId to 6 (cancelled by passenger)
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
    return journeyStatusId && journeyStatusId <= 4 ? journeyStatusId : null;
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
