const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const getFormattedDateTime = require("../Utils/currentDate");
const {
  WSServerTextMessageResponder,
  listOfPassangerWs,
} = require("../Utils/WsServerResponder");
const createJWT = require("../Utils/createJWT");
const registerDecision = require("../Utils/registerDecision");
const {
  verifyExistenceOfDriverInWaitingState,
} = require("../Validator/Driver.validator");
const {
  updateDriverWaittingStatus,
  updateuserJourneyStatus,
  updateDecisionStatus,
  updateJourneyStatus,
  updateOTPToUsersCredentials,
  updateData,
} = require("../CRUD/Update/Data.update");
const {
  getDataOfSingleDriverWaiting,
  getSingleDataOfPassengerRequest,
  getDataOfSingleDecision,
  getSingleDataOfJourney,
  verifyExistanceOfData,
  performJoinSelect,
  findPassengerForDriver,
} = require("../CRUD/Read/ReadData");
const {
  insertJourneyData,
  registerDriverTostartJob,
  registerUserToUsersTable,
  insertData,
} = require("../CRUD/Create/CreateData");
const { sendNotificationToPassenger } = require("../Utils/Notifications");
const currentDate = require("../Utils/currentDate");

const checkGetMethodes = async () => {
  return {
    message: "success",
    data: "checkGetMethodes",
  };
};

const cancelRequest = async (req) => {
  try {
    const body = req?.body,
      passengerPhone = body?.passengerPhone,
      requestUniqueId = body?.requestUniqueId;
    const waitUniqueId = body?.waitUniqueId;
    const decisionUniqueId = body?.decisionUniqueId;
    const userData = req?.user?.data;
    if (!userData) {
      return { message: "error", error: "User not found" };
    }
    console.log("under userData");
    if (waitUniqueId) {
      const driverStatus = await updateDriverWaittingStatus(
        waitUniqueId,
        "cancelled by driver"
      );
      console.log("driverStatus", driverStatus);
      if (driverStatus.affectedRows == 0) {
        return { message: "error", error: "Request cancellation failed" };
      }
    }
    console.log("after waitUniqueId");
    if (requestUniqueId) {
      const passangerRequest = await updateuserJourneyStatus(
        requestUniqueId,
        "cancelled by driver"
      );
      if (passangerRequest.affectedRows == 0) {
        return { message: "error", error: "Request cancellation failed" };
      }
    }
    if (decisionUniqueId) {
      const decisionResult = await updateDecisionStatus(
        decisionUniqueId,
        "cancelled by driver"
      );
      if (decisionResult.affectedRows == 0) {
        return { message: "error", error: "Request cancellation failed" };
      }
    }
    sendAcceptanceNotificationToPassanger({
      phoneNumber: passengerPhone,
      message: { status: "cancelled by driver" },
    });
    return {
      status: "cancelled by driver",
      message: "success",
      data: "Request canceled successfully",
    };
  } catch (error) {
    console.error("Error in cancelWaittingRequest:", error.message);
    return { message: "error", error: "Unable to cancel request" };
  }
};

const registerDriverToGetPassengerRequest = async (req) => {
  try {
    const { currentLocation, driverWaitStatusId } = req.body;
    console.log("currentLocation", currentLocation);
    const { userUniqueId } = req.user.data;
    const { latitude, longitude, placeName } = currentLocation;
    let waitUniqueId = uuidv4();
    let decision = null,
      driverWaiting = null,
      driverStatus = null,
      passenger = null,
      journey = null;
    console.log("userUniqueId", userUniqueId);
    // return;
    const existingDriver = await verifyExistenceOfDriverInWaitingState({
      userUniqueId,
    });
    // console.log("existingDriver ==========> ", existingDriver);
    // return;
    if (existingDriver?.length > 0) {
      driverStatus = existingDriver?.at(0).status;
      // if status is in ('accepted','requested','journey started')
      // it has to get data of passanger decision, journey or others
      if (
        driverStatus === "accepted" ||
        driverStatus === "requested" ||
        driverStatus === "journey started"
      ) {
        const waitUniqueId = existingDriver?.at(0).waitUniqueId;
        if (waitUniqueId)
          decision = await getDataOfSingleDecision(
            "driverWaitUniqueId",
            waitUniqueId
          );
        const decisionUniqueId = await decision?.decisionUniqueId;
        const passengerRequestUniqueId = decision?.passengerRequestUniqueId;
        // console.log("decision=============>", decision);
        console.log("passengerRequestUniqueId", passengerRequestUniqueId);
        // get data of passenger
        if (passengerRequestUniqueId)
          passenger = await getSingleDataOfPassengerRequest(
            "requestUniqueId",
            passengerRequestUniqueId
          );
        // get data of journey
        if (decisionUniqueId)
          journey = await getSingleDataOfJourney(
            "decisionUniqueId",
            decisionUniqueId
          );
        const phoneNumber = passenger?.passengerPhone;
        const message = {
          status: driverStatus,
          journey,
          message: "success",
          passenger,
          driver: existingDriver?.at(0),
          decision,
        };
        sendAcceptanceNotificationToPassanger({
          message,
          phoneNumber,
        });
        return message;
      }
    }
    // If the driver is not in waiting, register the driver in waiting
    let insertedRows = { affectedRows: 0 };
    if (existingDriver?.length === 0) {
      const waitTime = getFormattedDateTime();

      const registeredResult = await registerDriverTostartJob({
        waitUniqueId,
        userUniqueId,
        latitude,
        longitude,
        placeName,
        driverWaitStatusId,
        waitTime,
      });
      console.log("registerResult=>", registeredResult);

      if (registeredResult.affectedRows > 0) {
        insertedRows.affectedRows = 1;
        driverWaiting = await getDataOfSingleDriverWaiting(
          "waitUniqueId",
          waitUniqueId
        );
      } else {
        return {
          message: "error",
          error: "Failed to start journey",
        };
      }
    } else {
      waitUniqueId = existingDriver?.at(0)?.waitUniqueId;
      driverWaiting = existingDriver?.at(0);
    }

    if (insertedRows.affectedRows > 0 || existingDriver?.length > 0) {
      const passenger = await findPassengerForDriver();
      //  if passanger exists set passanger status requested
      if (passenger?.length > 0) {
        const requestUniqueId = passenger?.at(0)?.requestUniqueId;
        const userJourneyStatus = await updateuserJourneyStatus(
          requestUniqueId,
          "requested"
        );
        if (userJourneyStatus?.affectedRows === 1) {
        } else {
          // Respond with error message from userJourneyStatus
          return {
            message: "error",
            error: "unable to update passenger request status",
          };
        }
        //if there is passenger, Register decision to agree with passenger or not to agree

        const decisionResult = await registerDecision({
          requestUniqueId,
          waitUniqueId,
          actor: "driver",
        });

        console.log("decisionResult", decisionResult);
        if (decisionResult.message === "success") {
          decision = decisionResult;
          driverStatus = "requested";

          const waitingResult = await updateDriverWaittingStatus(
            waitUniqueId,
            "requested"
          );
          driverWaiting = await getDataOfSingleDriverWaiting(
            "waitUniqueId",
            waitUniqueId
          );
        } else {
          // Respond with error message from decisionResult
          return decisionResult;
        }
        // sendAcceptanceNotificationToPassanger();
      }
      const message = {
        status: driverStatus,
        decision,
        driver: driverWaiting,
        passenger: Users.length > 0 ? passenger?.at(0) : null,
        message: "success",
        data: "Driver wait registered successfully",
      };
      return message;
    } else {
      return { message: "error", data: "Driver can't connect to start job" };
    }
  } catch (error) {
    console.error("Error inserting driver wait data:", error);
    return { message: "error", data: "Driver can't connect to start job" };
  }
};

const rejectPassangersRequest = async (req) => {
  try {
    const { decisionUniqueId, requestUniqueId, waitUniqueId, passengerPhone } =
      req.body;
    // console.log("passengerPhone==============", passengerPhone);
    // console.log("req.body", req.body);
    // return;
    const driverWaitStatus = await updateDriverWaittingStatus(
      waitUniqueId,
      "cancelled by driver"
    );
    const passangerRequsetStatus = await updateuserJourneyStatus(
      requestUniqueId,
      "cancelled by driver"
    );
    const decisionStatus = await updateDecisionStatus(
      decisionUniqueId,
      "cancelled by driver"
    );

    if (
      passangerRequsetStatus.affectedRows > 0 &&
      decisionStatus.affectedRows > 0
    ) {
      sendAcceptanceNotificationToPassanger({
        message: { status: "cancelled by driver", message: "success" },
        phoneNumber: passengerPhone,
      });
      return { message: "success", data: "Request rejected successfully" };
    } else {
      return { message: "error", error: "Request rejection failed" };
    }
  } catch (error) {
    console.log("error @rejectPassangersRequest", error);
    return { message: "error", error: "Request rejection failed" };
  }
};
const acceptPassangersRequest = async (req) => {
  try {
    const {
      journeyDecisionUniqueId,
      passengerRequestUniqueId,
      driverWaitUniqueId,
    } = req.body;
    // update journey Decisions
    const journeyDecisionStatus = await updateData({
      tableName: "journeyDecisions",
      updateValues: { journeyStatusId: 3 },
      conditions: { journeyDecisionUniqueId },
    });
    //update passengers Reqests journey status
    const passangerRequestStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId: 3 },
      conditions: { requestUniqueId: passengerRequestUniqueId },
    });
    // update drivers request waitting status
    const driverWaitStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId: 3 },
      conditions: { requestUniqueId: driverWaitUniqueId },
    });
    if (
      journeyDecisionStatus.affectedRows > 0 &&
      driverWaitStatus.affectedRows > 0 &&
      passangerRequestStatus.affectedRows > 0
    ) {
      // get passengers inf and current request
      const passenger = await performJoinSelect({
          baseTable: "Users",
          joins: [
            {
              table: "Requests",
              on: "Requests.userUniqueId = Users.userUniqueId",
            },
          ],

          conditions: { requestUniqueId: passengerRequestUniqueId },
        }),
        driver = await performJoinSelect({
          baseTable: "Users",
          joins: [
            {
              table: "Requests",
              on: "Requests.userUniqueId = Users.userUniqueId",
            },
          ],
          conditions: { requestUniqueId: driverWaitUniqueId },
        }),
        decision = await verifyExistanceOfData({
          tableName: "journeyDecisions",
          conditions: { journeyDecisionUniqueId },
        });
      const userPassengerPhoneNumber = passenger[0].phoneNumber;
      sendNotificationToPassenger({
        phoneNumber: userPassengerPhoneNumber,
        message: {
          status: 3,
          message: {
            driver: driver[0],
            passenger: passenger[0],
            decision: decision[0],
          },
        },
      });
      return { message: "success", data: "Request accepted successfully" };
    } else {
      return { message: "error", error: "Request acceptance failed" };
    }
  } catch (error) {
    console.log("  error @acceptPassangersRequest", error);
    return { message: "error", error: "Request acceptance failed" };
  }
};
const sendAcceptanceNotificationToPassanger = async ({
  message,
  phoneNumber,
}) => {
  // console.log("listOfPassangerWs", listOfPassangerWs);
  listOfPassangerWs.forEach((passanger) => {
    // console.log("passanger.phoneNumber", passanger.phoneNumber);
    if (passanger.phoneNumber == phoneNumber) {
      WSServerTextMessageResponder(passanger.WS, message);
    }
  });
  return { message: "success", data: "Request accepted successfully" };
};

const startJourney = async (req) => {
  try {
    const {
      journeyDecisionUniqueId,
      passengerRequestUniqueId,
      driverWaitUniqueId,
    } = req.body;
    console.log("req.body============>", req.body);
    // update journey Decisions
    const decisionStatus = await updateData({
      tableName: "journeyDecisions",
      updateValues: { journeyStatusId: 4 },
      conditions: { journeyDecisionUniqueId },
    });
    // update passengers Reqests journey status
    const passangerRequestStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId: 4 },
      conditions: { requestUniqueId: passengerRequestUniqueId },
    });
    // update drivers request waitting status
    const driverWaitStatus = await updateData({
      tableName: "Requests",
      updateValues: { journeyStatusId: 4 },
      conditions: { requestUniqueId: driverWaitUniqueId },
    });
    // get passengers info and current request
    const passenger = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],

        conditions: { requestUniqueId: passengerRequestUniqueId },
      }),
      // get drivers info and current request
      driver = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { requestUniqueId: driverWaitUniqueId },
      }),
      // update journey decisions
      decision = await verifyExistanceOfData({
        tableName: "journeyDecisions",
        conditions: { journeyDecisionUniqueId },
      });
    // verify if journey exists
    let journey = await verifyExistanceOfData({
      tableName: "Journey",
      conditions: { journeyDecisionUniqueId },
    });
    if (journey.length <= 0) {
      // insert data to journey table if journey doesn't exist
      const journeyUniqueId = uuidv4();
      const registerJourney = await insertData({
        tableName: "Journey",
        colAndVal: {
          journeyUniqueId,
          journeyDecisionUniqueId,
          startTime: currentDate(),
          journeyStatusId: 4,
        },
      });
      journey = await verifyExistanceOfData({
        tableName: "Journey",
        conditions: { journeyUniqueId },
      });
    }
    return {
      message: "success",
      data: {
        passenger: passenger[0],
        driver: driver[0],
        decision: decision[0],
        journey: journey[0],
      },
    };
  } catch (error) {
    console.error("Error starting journey:", error);
    return { message: "error", error: "Failed to start journey" };
  }
};

const driverArrivedDestination = async (req) => {
  try {
    const {
      journeyDecisionUniqueId,
      passengerRequestUniqueId,
      driverWaitUniqueId,
    } = req.body;
    // update journey Decisions
    const decisionStatus = await updateData({
        tableName: "journeyDecisions",
        updateValues: { journeyStatusId: 5 },
        conditions: { journeyDecisionUniqueId },
      }),
      // update passengers Reqests journey status
      passangerRequestStatus = await updateData({
        tableName: "Requests",
        updateValues: { journeyStatusId: 5 },
        conditions: { requestUniqueId: passengerRequestUniqueId },
      }),
      // update drivers request waitting status
      driverWaitStatus = await updateData({
        tableName: "Requests",
        updateValues: { journeyStatusId: 5 },
        conditions: { requestUniqueId: driverWaitUniqueId },
      }),
      // get passengers info and current request
      passenger = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],

        conditions: { requestUniqueId: passengerRequestUniqueId },
      }),
      // get drivers info and current request
      driver = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "Requests",
            on: "Requests.userUniqueId = Users.userUniqueId",
          },
        ],
        conditions: { requestUniqueId: driverWaitUniqueId },
      }),
      decision = await verifyExistanceOfData({
        tableName: "journeyDecisions",
        conditions: { journeyDecisionUniqueId },
      }),
      // insert data to journey table
      updateJourney = await updateData({
        tableName: "Journey",
        conditions: { journeyDecisionUniqueId },
        updateValues: { journeyStatusId: 5 },
      }),
      journey = await verifyExistanceOfData({
        tableName: "Journey",
        conditions: { journeyDecisionUniqueId },
      }),
      passengersPhoneNumber = passenger[0].phoneNumber,
      Notifications = await sendNotificationToPassenger({
        phoneNumber: passengersPhoneNumber,
        message: {
          passenger: passenger[0],
          driver: driver[0],
          decision: decision[0],
          journey: journey[0],
          status: 5,
        },
      });
    return {
      message: "success",
      data: {
        passenger: passenger[0],
        driver: driver[0],
        decision: decision[0],
        journey: journey[0],
        status: 5,
      },
    };
  } catch (error) {
    console.error("Error completing journey:", error);
    return { message: "error", error: "Failed to complete journey" };
  }
};
const deleteTablesData = async (req) => {
  try {
    let tables = req.body.tables;
    console.log("in deleteTablesData ===>", req.body.tables);
    // return;
    tables.map(async (table) => {
      const deleteSql = `delete from ${table}`;
      const Result = await pool.query(deleteSql);
      console.log("Result", Result);
    });
    return { message: "success" };
  } catch (error) {
    console.log("error", error);
    return {
      message: "error",
    };
  }
};
module.exports = {
  driverArrivedDestination,
  startJourney,
  rejectPassangersRequest,
  acceptPassangersRequest,
  registerDriverToGetPassengerRequest,
  cancelRequest,
  checkGetMethodes,
  deleteTablesData,
};
