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
} = require("../CRUD/Update/Data.update");
const {
  getDataOfSingleDriverWaiting,
  getSingleDataOfPassengerRequest,
  getDataOfSingleDecision,
  getSingleDataOfJourney,
} = require("../CRUD/Read/ReadData");
const {
  insertJourneyData,
  registerDriverTostartJob,
  registerUserToUsersTable,
} = require("../CRUD/Create/CreateData");

const checkGetMethodes = async () => {
  return {
    message: "success",
    data: "checkGetMethodes",
  };
};
async function findPassengerForDriver() {
  // create sql to get passanger request in the database with table name of PassengerRequest
  const sql = `SELECT * FROM PassengerRequest join Users on PassengerRequest.userUniqueId = Users.userUniqueId and PassengerRequest.status = "waiting" ORDER BY requestId DESC LIMIT 1`;
  const [rows] = await pool.query(sql);
  return rows;
}

const cancelRequest = async (req) => {
  try {
    const body = req?.body,
      passengerPhone = body?.passengerPhone,
      requestUniqueId = body?.requestUniqueId;
    const waitUniqueId = body?.waitUniqueId;
    const decisionUniqueId = body?.decisionUniqueId;

    console.log(
      "requestUniqueId=========",
      requestUniqueId,
      " decisionUniqueId======",
      decisionUniqueId,
      " waitUniqueId==========",
      waitUniqueId
    );
    // return;
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

const verifyStatusOfDriver = async (req) => {
  try {
    const { userUniqueId } = req.user.data;
    // console.log("userUniqueId", userUniqueId);
    const sqlToVerifyWaiting = `SELECT * FROM driverWaits WHERE userUniqueId = ? order by waitId desc limit 1 `;
    const [driverWaitResult] = await pool.query(sqlToVerifyWaiting, [
      userUniqueId,
    ]);
    // console.log("driverWaitResult", driverWaitResult);
    let status = null,
      waitUniqueId = null,
      decision = null,
      passenger = null,
      driverWaiting = null,
      journey = null;
    if (driverWaitResult?.length > 0) {
      status = driverWaitResult?.at(0)?.status;
      waitUniqueId = driverWaitResult?.at(0)?.waitUniqueId;
      driverWaiting = driverWaitResult?.at(0);
    } else {
      return { message: "Success", data: "driver can start job" };
    }
    // console.log("status of driver ", status);
    if (!status) {
      return { message: "error", error: "unknown status of driver" };
    }
    if (
      status == "accepted" ||
      status == "journey started" ||
      status == "requested"
    ) {
      const waitUniqueId = driverWaitResult[0].waitUniqueId;
      const sqlToGetDecisionStatus = `select * from journeyDecisions  where driverWaitUniqueId = ? order by decisionId desc limit 1 `;
      const [rows] = await pool.query(sqlToGetDecisionStatus, waitUniqueId);
      const decisionUniqueId = rows?.at(0)?.decisionUniqueId;
      if (rows?.length > 0) {
        if (status == "journey started") {
          const sqlToGetDataOfJourney = `select * from journeys where decisionUniqueId = ?`;
          const [resultOfJourney] = await pool.query(
            sqlToGetDataOfJourney,
            decisionUniqueId
          );
          console.log("resultOfJourney", resultOfJourney);
          journey = resultOfJourney?.at(0);
        }

        const passengerRequestUniqueId = rows?.at(0)?.passengerRequestUniqueId;
        // get decision data
        decision = rows?.at(0);
        const sqlToGetPassengerRequest = `select * from PassengerRequest,passenger where requestUniqueId = ? and Users.userUniqueId = PassengerRequest.userUniqueId`;
        const [passengerRequest] = await pool.query(sqlToGetPassengerRequest, [
          passengerRequestUniqueId,
        ]);
        if (passengerRequest.length == 0)
          return {
            message: "error",
            error: "Unable to get passenger request data",
          };
        passenger = passengerRequest[0];
        const responseData = {
          message: "success",
          status,
          passenger,
          decision,
          driver: driverWaiting,
          journey: journey ? journey : "",
        };
        return responseData;
      } else {
        return { message: "error", error: "driver did not give any yet" };
      }
    } else if (status == "waiting") {
      // findPassengerForDriver
      const passenger = await findPassengerForDriver();
      console.log("passenger====>", passenger);
      if (passenger?.length == 0)
        return {
          message: "success",
          status,
          passenger: null,
          decision,
          driver: driverWaiting,
          journey: journey ? journey : "",
          data: "passenger not found",
        };
      // register decision to agree with passenger or not to agree
      const requestUniqueId = passenger?.at(0)?.requestUniqueId;
      if (!requestUniqueId)
        return { message: "error", error: "Unable to get passangers detail" };
      // let decisionResult = await verifyExistanceOfPassangerInDecision(
      //   requestUniqueId
      // );
      let registerOnDecision = await registerDecision({
        requestUniqueId,
        waitUniqueId,
        actor: "driver",
      });

      if (registerOnDecision?.message == "success") {
        const waitingResult = await updateDriverWaittingStatus(
          waitUniqueId,
          "requested"
        );
        if (waitingResult.affectedRows == 0)
          return { message: "error", error: "Unable to update waiting data" };
        const passengerRequestResult = await updateuserJourneyStatus(
          requestUniqueId,
          "requested"
        );
        if (passengerRequestResult.affectedRows == 0)
          return {
            message: "error",
            error: "Unable to update passanger request data",
          };
        status = "requested";
        return {
          message: "success",
          status,
          passenger: passenger?.at(0),
          decision: registerOnDecision,
          driver: driverWaiting,
          journey: journey ? journey : "",
        };
      } else {
        return { message: "error", error: "Unable to register decision" };
      }
    } else {
      console.log("status", status);

      // console.log("  else in verify status of driver", error);
      return { message: "succsee", data: "driver can start job" };
    }
  } catch (error) {
    console.error("Error in verifyStatusOfDriver:", error);
    return { message: "error", error: "Unable to verify current status" };
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
    const { decisionUniqueId, waitUniqueId, requestUniqueId } = req.body;
    const updateResultOfDecision = await updateDecisionStatus(
      decisionUniqueId,
      "accepted"
    );
    const updateResultOfPassangerRequest = await updateuserJourneyStatus(
      requestUniqueId,
      "accepted"
    );
    console.log("requestUniqueId", requestUniqueId);
    // return;

    const updateResultOfDriverWaiting = await updateDriverWaittingStatus(
      waitUniqueId,
      "accepted"
    );
    console.log(
      "updateResultOfPassangerRequest",
      updateResultOfPassangerRequest
    );
    if (
      updateResultOfDecision.affectedRows == 1 &&
      updateResultOfDriverWaiting.affectedRows == 1 &&
      updateResultOfPassangerRequest.affectedRows == 1
    ) {
      console.log("waitUniqueId", waitUniqueId);
      const driver = await getDataOfSingleDriverWaiting(
        "waitUniqueId",
        waitUniqueId
      );
      if (!driver)
        return { message: "error", data: "un able to get driver data" };
      console.log("driver data is =>", driver);
      const passenger = await getSingleDataOfPassengerRequest(
        "requestUniqueId",
        requestUniqueId
      );
      if (!passenger)
        return { message: "error", data: "un able to get passenger data" };
      const decision = await getDataOfSingleDecision(
        "decisionUniqueId",
        decisionUniqueId
      );
      if (!decision)
        return { message: "error", data: "unable to get decision data" };
      const phoneNumber = passenger?.passengerPhone;

      const message = {
        passenger,
        decision,
        driver,
        journey: null,
        status: "accepted",
      };
      const result = await sendAcceptanceNotificationToPassanger({
        message,
        phoneNumber,
      });

      return message;
    } else {
      console.log("error in accept passangers request");
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
    const { waitUniqueId, requestUniqueId, decisionUniqueId } = req.body;

    // Update statuses for driver, passenger, and decision
    const waitStatusResult = await updateDriverWaittingStatus(
      waitUniqueId,
      "journey started"
    );
    const userJourneyStatus = await updateuserJourneyStatus(
      requestUniqueId,
      "journey started"
    );
    const decisionStatusResult = await updateDecisionStatus(
      decisionUniqueId,
      "journey started"
    );
    // Check if all updates were successful
    if (
      waitStatusResult.affectedRows > 0 &&
      userJourneyStatus.affectedRows > 0 &&
      decisionStatusResult.affectedRows > 0
    ) {
      const passenger = await getSingleDataOfPassengerRequest(
        "requestUniqueId",
        requestUniqueId
      );
      const passengerPhone = passenger?.passengerPhone;
      // check if decisionUniqueId is in journey
      let journeyResult = await getSingleDataOfJourney(
        "decisionUniqueId",
        decisionUniqueId
      );

      const driver = await getDataOfSingleDriverWaiting(
        "waitUniqueId",
        waitUniqueId
      );
      const decision = await getDataOfSingleDecision(
        "decisionUniqueId",
        decisionUniqueId
      );
      let journey = await getSingleDataOfJourney(
        "decisionUniqueId",
        decisionUniqueId
      );

      if (journeyResult) {
        sendAcceptanceNotificationToPassanger({
          message: {
            message: "journey started",
            status: "journey started",
            driver,
            decision,
            journey,
            passenger,
          },
          phoneNumber: passengerPhone,
        });
        return {
          message: "success",
          journey: journeyResult,
          status: "journey started",
          driver,
          decision,
          journey,
          passenger,
        };
      } else {
        // Insert new journey record
        const journeyInsertResult = await insertJourneyData({
          decisionUniqueId,
        });
        if (journeyInsertResult.message == "success") {
          journey = journeyInsertResult;
          sendAcceptanceNotificationToPassanger({
            message: {
              message: "journey started",
              status: "journey started",
              driver,
              decision,
              journey,
              passenger,
            },
            phoneNumber: passengerPhone,
          });
          return {
            message: "success",
            data: "Journey started successfully",
            journey: journeyInsertResult,
          };
        } else {
          return { message: "error", error: "Failed to start journey" };
        }
      }
    } else {
      return {
        message: "error",
        error: "Failed to update statuses for journey start",
      };
    }
  } catch (error) {
    console.error("Error starting journey:", error);
    return { message: "error", error: "Failed to start journey" };
  }
};

const driverArrivedDestination = async (req) => {
  try {
    const { waitUniqueId, requestUniqueId, decisionUniqueId, journeyUniqueId } =
      req.body;
    console.log("req.body====", req.body);
    const decisionStatus = await updateDecisionStatus(
      decisionUniqueId,
      "completed"
    );
    console.log("decisionStatus=======> ", decisionStatus);
    if (decisionStatus.affectedRows === 0) {
      return { message: "error", error: "Failed to update decision status" };
    }
    // Update driver waiting status
    const waitStatusResult = await updateDriverWaittingStatus(
      waitUniqueId,
      "completed"
    );
    if (waitStatusResult.affectedRows === 0) {
      return {
        message: "error",
        error: "Failed to update driver waiting status",
      };
    }

    // Update passenger request status
    const userJourneyStatus = await updateuserJourneyStatus(
      requestUniqueId,
      "completed"
    );
    if (userJourneyStatus.affectedRows === 0) {
      return {
        message: "error",
        error: "Failed to update passenger request status",
      };
    }

    // Update journey status
    const journeyStatusResult = await updateJourneyStatus(
      journeyUniqueId,
      "completed"
    );
    const passangerData = await getSingleDataOfPassengerRequest(
      "requestUniqueId",
      requestUniqueId
    );
    const passengerPhone = passangerData?.passengerPhone;
    console.log("passengerPhone", passangerData.passengerPhone);
    sendAcceptanceNotificationToPassanger({
      message: {
        message: "success",
        data: "Journey completed successfully",
        status: "completed",
      },
      phoneNumber: passengerPhone,
    });
    if (journeyStatusResult.affectedRows === 0) {
      return { message: "error", error: "Failed to update journey status" };
    }

    return { message: "success", data: "Journey completed successfully" };
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
  findPassengerForDriver,
  driverArrivedDestination,
  startJourney,
  rejectPassangersRequest,
  acceptPassangersRequest,
  verifyStatusOfDriver,
  registerDriverToGetPassengerRequest,
  cancelRequest,
  checkGetMethodes,
  deleteTablesData,
};
