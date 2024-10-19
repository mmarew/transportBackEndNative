// services/Passenger.service.js
const {
  getData,
  findNearbyDrivers,
  checkUserExists,
  checkActivePassengerRequest,
  performJoinSelect,
} = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { deleteData } = require("../CRUD/Delete/DeleteData");
const {
  createPassengerRequest,
  insertData,
} = require("../CRUD/Create/CreateData");
const { v4: uuidv4 } = require("uuid");
const { sendNotificationToDriver } = require("../Utils/Notifications");

const createRequest = async (body, user) => {
  try {
    const { userUniqueId } = user?.data;
    // 1. Check if the user exists
    const existingUser = await checkUserExists(userUniqueId);
    if (!existingUser) {
      return { message: "error", error: "User passenger not found" };
    }
    // 2. Check if the user already has an active request
    const activeRequest = await checkActivePassengerRequest(userUniqueId);
    if (activeRequest?.length == 0) {
      await createPassengerRequest(body, userUniqueId);
    }
    // 3. Create a new passenger request
    return await verifyPassengerStatus({ userUniqueId, activeRequest });
  } catch (error) {
    console.error("Error in createRequest:", error);
    return { message: "error", error: "Unable to create request" };
  }
};

const getRequestById = async (requestId) => {
  try {
    const result = await getData({
      tableName: "PassengerRequest",
      conditions: { passengerRequestId: requestId },
    });

    if (!result?.length) {
      return { message: "error", error: "Request not found" };
    }

    return { message: "success", data: result[0] };
  } catch (error) {
    console.error("Error in getRequestById:", error);
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
    console.error("Error in updateRequestById:", error);
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
    console.error("Error in deleteRequest:", error);
    return { message: "error", error: "Unable to delete request" };
  }
};

const verifyPassengerStatus = async ({ userUniqueId, activeRequest }) => {
  try {
    // 1. Check if the user has an active request (status 1, 2, 3, or 4)
    if (!activeRequest || activeRequest?.length == 0)
      activeRequest = await checkActivePassengerRequest(userUniqueId);
    console.log("activeRequest in verifyPassengerStatus", activeRequest);
    // If no active request, return an error
    if (activeRequest?.length == 0) {
      return {
        message: "success",
        data: "No active requests found for this user",
        status: null,
      };
    }

    const passengerRequest = activeRequest[0]; // Get the first active request
    const journeyStatusId = passengerRequest.journeyStatusId;

    // 2. Retrieve passenger data
    const passenger = (
      await performJoinSelect({
        baseTable: "PassengerRequest",
        joins: [
          {
            table: "Users",
            on: "PassengerRequest.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: {
          passengerRequestUniqueId: passengerRequest.passengerRequestUniqueId,
        },
      })
    )[0];

    // 3. If journeyStatusId is 1 (Waiting), find a driver
    if (journeyStatusId === 1) {
      const nearbyDrivers = await findNearbyDrivers({
        passengerRequest,
      });
      console.log("nearbyDrivers", nearbyDrivers);
      // If no drivers are found, return the status
      if (!nearbyDrivers?.length) {
        return {
          message: "success",
          status: 1,
          passenger,
          driver: null,
          journey: null,
          decisions: null,
        };
      }

      const driver = nearbyDrivers[0]; // Get the first nearby driver

      // 4. Create a new record in JourneyDecisions if driver is found
      const journeyDecisionUniqueId = uuidv4();
      const journeyDecisionPayload = {
        journeyDecisionUniqueId,
        passengerRequestId: passengerRequest.passengerRequestId,
        driverRequestId: driver.driverRequestId,
        journeyStatusId: 2, // Requested status
        decisionTime: new Date(),
      };

      await insertData({
        tableName: "JourneyDecisions",
        colAndVal: journeyDecisionPayload,
      });
      await updateData({
        tableName: "PassengerRequest",
        conditions: { passengerRequestId: passengerRequest.passengerRequestId },
        updateValues: { journeyStatusId: 2 },
      });
      await updateData({
        tableName: "DriverRequest",
        conditions: { driverRequestId: driver.driverRequestId },
        updateValues: { journeyStatusId: 2 },
      });
      const message = {
        message: "success",
        status: 2,
        passenger,
        driver,
        journey: null,
        decisions: journeyDecisionPayload,
      };
      const phoneNumber = driver?.phoneNumber;
      await sendNotificationToDriver({
        message,
        phoneNumber,
      });

      // 5. Return response with passenger, driver, and journey decision data
      return {
        message: "success",
        status: 2,
        ...message,
      };
    }

    // 6. If journeyStatusId is not 1, return data for passenger, driver, journey, and decisions
    const journeyDecision = await getData({
      tableName: "JourneyDecisions",
      conditions: { passengerRequestId: passengerRequest.passengerRequestId },
    });

    const journey = await getData({
      tableName: "Journey",
      conditions: {
        journeyDecisionUniqueId: journeyDecision[0].journeyDecisionUniqueId,
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
      conditions: { driverRequestId: journeyDecision[0].driverRequestId },
    });
    const driver = driverData[0];
    const phoneNumber = driver?.phoneNumber;
    const message = {
      message: "success",
      status: driver?.journeyStatusId,
      passenger,
      driver,
      journey: journey[0] || null,
      decisions: journeyDecision[0] || null,
    };
    if (phoneNumber)
      await sendNotificationToDriver({
        message,
        phoneNumber,
      });
    // 7. Return the final response
    return {
      message: "success",
      status: driver?.journeyStatusId,
      ...message,
    };
  } catch (error) {
    console.error("Error in verifyPassengerStatus:", error);
    return { message: "error", error: "Unable to verify passenger status" };
  }
};

module.exports = {
  verifyPassengerStatus,
  createRequest,
  getRequestById,
  updateRequestById,
  deleteRequest,
};
