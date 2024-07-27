const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const getFormattedDateTime = require("../Utils/currentDate");
const {
  WsServerSMSResponder,
  WSServerTextMessageResponder,
  listOfPassangerWs,
} = require("../Utils/WsServerResponder");
const verifyDriverExistence = require("../Middleware/verifyDriverExistence");
const { deleteFile } = require("../Utils/fileUtils");
const createJWT = require("../Utils/createJWT");
const registerDecision = require("../Utils/registerDecision");
const {
  verifyExistenceOfDriverInWaitingState,
} = require("../Validator/Driver.validator");
const {
  updateDriverWaittingStatus,
  updatePassengerRequestStatus,
  updateDecisionStatus,
  updateJourneyStatus,
} = require("../CRUD/Update/Driver.update");

const checkGetMethodes = async () => {
  return {
    message: "success",
    data: "checkGetMethodes",
  };
};
async function findPassengerForDriver() {
  // create sql to get passanger request in the database with table name of PassengerRequests
  const sql = `SELECT * FROM passengerRequests join passenger on passengerRequests.passengerUniqueId = passenger.passengerUniqueId and passengerRequests.status = "waiting" ORDER BY requestId DESC LIMIT 1`;
  const [rows] = await pool.query(sql);
  return rows;
}

async function insertToDriversData({
  uniqueId,
  fullName,
  phoneNumber,
  email,
  OTP,
}) {
  const sqlToRegisterDriver = `INSERT INTO driversInfo (driverUniqueId, fullName, phoneNumber, email) 
    VALUES (?, ?, ?, ?)`;

  const sqlToRegisterDriverCredentials = `
    INSERT INTO driversCredentials (driversCredentialUniqueId,driverUniqueId, driversPinCode) 
    VALUES (?,?, ?);
  `;

  const [resultOfDriversRegistration] = await pool.query(sqlToRegisterDriver, [
    uniqueId,
    fullName,
    phoneNumber,
    email,
  ]);
  console.log("resultOfDriversRegistration", resultOfDriversRegistration);
  if (resultOfDriversRegistration.affectedRows === 0) {
    return {
      message: "error",
      error: "Unable to register driver",
    };
  }

  const [resultOfDriversCredentialsRegistration] = await pool.query(
    sqlToRegisterDriverCredentials,
    [uuidv4(), uniqueId, OTP]
  );
  console.log(
    "resultOfDriversCredentialsRegistration",
    resultOfDriversCredentialsRegistration
  );
  if (resultOfDriversCredentialsRegistration.affectedRows > 0) {
    return await WsServerSMSResponder(phoneNumber, OTP);
  } else {
    return {
      message: "error",
      error: "Unable to register driver credentials",
    };
  }
}

async function registerDriver(req) {
  const { fullName, phoneNumber, email } = req.body;
  console.log("first req.body", req.body);
  // return;
  try {
    // If driver is not registered, handle the file uploads

    // let drivingLicenceFile = req?.files["drivingLicenceFile"]
    //   ? req?.files["drivingLicenceFile"][0]
    //   : null;
    // let driversProfileImg = req?.files["driversProfileImg"]
    //   ? req?.files["driversProfileImg"][0]
    //   : null;

    // if (!drivingLicenceFile) {
    //   return { message: "error", error: "No driving licence file uploaded" };
    // }
    // if (!driversProfileImg) {
    //   return { message: "error", error: "No profile image file uploaded" };
    // }

    // drivingLicenceFile = drivingLicenceFile?.filename;
    // driversProfileImg = driversProfileImg?.filename;

    // Check if driver is already registered
    const existingDrivers = await verifyDriverExistence(email, phoneNumber);
    const OTP = Math.floor(1000 + Math.random() * 900000);
    if (existingDrivers.length > 0) {
      // Delete uploaded files to prevent junk files
      // if (req.files["drivingLicenceFile"]) {
      //   deleteFile(req.files["drivingLicenceFile"][0].path);
      // }
      // if (req.files["driversProfileImg"]) {
      //   deleteFile(req.files["driversProfileImg"][0].path);
      // }
      const { driverUniqueId } = existingDrivers[0];
      const registerOTPResult = await updateOTPToDriver({
        driverUniqueId,
        OTP,
        phoneNumber,
      });
      console.log("registerOTPResult", registerOTPResult);
      if (registerOTPResult.message === "success") {
        // fetch driver details from existingDrivers
        return {
          message: "success",
          messageDetail: "Driver already registered, OTP sent successfully",
        };
      } else {
        return {
          message: "error",
          error: "Unable to send OTP to driver",
        };
      }
    }

    const uniqueId = uuidv4();

    try {
      const registerResult = await insertToDriversData({
        uniqueId,
        fullName,
        phoneNumber,
        email,
        OTP,
      });

      if (registerResult.message === "success") {
        return {
          message: "success",
          messageDetail: "Driver registered successfully",
        };
      } else {
        throw new Error("Unable to register driver");
      }
    } catch (error) {
      console.error("Error registering driver:", error);
      return { message: "error", error: "Unable to register driver" };
    }
  } catch (error) {
    console.error("Error in register Driver:", error);
    return {
      message: "error",
      error: error.message || "Unable to register driver",
    };
  }
}

// Placeholder for updateOTPToDriver function
async function updateOTPToDriver({ OTP, driverUniqueId, phoneNumber }) {
  console.log(
    " OTP, driverUniqueId, phoneNumber",
    OTP,
    driverUniqueId,
    phoneNumber
  );
  const updateSql = `UPDATE driversCredentials SET driversPinCode = ? WHERE driverUniqueId = ?`;
  let [updateResult] = await pool.query(updateSql, [OTP, driverUniqueId]);
  if (updateResult.affectedRows > 0) {
    return WsServerSMSResponder(phoneNumber, OTP);
  } else return "fail to create OTP";
}

const verifyDriverByOTP = async (req) => {
  try {
    const { OTP, phoneNumber } = req.query;
    console.log("OTP, phoneNumber", OTP, phoneNumber);
    const result = await verifyDriverExistence(phoneNumber, phoneNumber);
    console.log("result on verifyDriverExistence ", result);
    // return;
    if (result.length == 0) {
      return { message: "error", error: "Driver not found" };
    }
    const {
      driverUniqueId,
      fullName,
      email,
      drivingLicenceFileName,
      drivingLicenceNumber,
    } = result[0];

    const token = createJWT({
      driverUniqueId,
      fullName,
      phoneNumber,
      email,

      driverStatus: "active",
    });

    const sqlToSelect = `SELECT driversPinCode FROM driversCredentials WHERE driverUniqueId = ?`;
    const [selectResult] = await pool.query(sqlToSelect, [driverUniqueId]);
    console.log(
      "selectResult=========>",
      selectResult,
      " driverUniqueId",
      driverUniqueId
    );
    if (selectResult[0].driversPinCode == OTP) {
      return { token, message: "success", data: "OTP verified successfully" };
    } else {
      return { message: "error", error: "OTP verification failed" };
    }
  } catch (error) {
    console.error("Error in verifyDriverByOTP:", error.message);
    return { message: "error", error: "Unable to verify driver" };
  }
};

const cancelRequest = async (req) => {
  try {
    const body = req?.body;
    const requestUniqueId = body?.requestUniqueId;
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
    if (waitUniqueId) {
      const driverStatus = await updateDriverWaittingStatus(
        waitUniqueId,
        "driver cancelled"
      );

      if (driverStatus.affectedRows == 0) {
        return { message: "error", error: "Request cancellation failed" };
      }
    }
    if (requestUniqueId) {
      const passangerRequest = await updatePassengerRequestStatus(
        requestUniqueId,
        "waiting"
      );
      if (passangerRequest.affectedRows == 0) {
        return { message: "error", error: "Request cancellation failed" };
      }
    }
    if (decisionUniqueId) {
      const decisionResult = await updateDecisionStatus(
        decisionUniqueId,
        "driver cancelled"
      );
      if (decisionResult.affectedRows == 0) {
        return { message: "error", error: "Request cancellation failed" };
      }
    }
    return { message: "success", data: "Request canceled successfully" };
  } catch (error) {
    console.error("Error in cancelWaittingRequest:", error.message);
    return { message: "error", error: "Unable to cancel request" };
  }
};

const registerDriverToGetPassengerRequest = async (req) => {
  try {
    const { currentLocation } = req.body;
    const { driverUniqueId } = req.user.data;
    const { latitude, longitude } = currentLocation;
    let waitUniqueId = uuidv4();
    let decision = null,
      driverWaiting = null;

    const existingDriver = await verifyExistenceOfDriverInWaitingState(
      driverUniqueId
    );

    // If the driver is not in waiting, register the driver in waiting
    let insertedRows = { affectedRows: 0 };
    if (existingDriver?.length === 0) {
      const sql = `INSERT INTO driverWaits (waitUniqueId, driverUniqueId, waitLatitude, waitLongitude) VALUES (?, ?, ?, ?)`;
      const values = [waitUniqueId, driverUniqueId, latitude, longitude];
      driverWaiting = {
        waitUniqueId,
        driverUniqueId,
        waitLatitude: latitude,
        waitLongitude: longitude,
      };
      const [rows] = await pool.query(sql, values);
      insertedRows = rows;
    } else {
      waitUniqueId = existingDriver?.at(0)?.waitUniqueId;
      driverWaiting = existingDriver?.at(0);
    }

    if (insertedRows.affectedRows > 0 || existingDriver?.length > 0) {
      const passenger = await findPassengerForDriver();
      //  if passanger exists set passanger status requested
      if (passenger?.length > 0) {
        const requestUniqueId = passenger?.at(0)?.requestUniqueId;
        const passengerRequestStatus = await updatePassengerRequestStatus(
          requestUniqueId,
          "requested"
        );
        if (passengerRequestStatus?.affectedRows === 1) {
        } else {
          // Respond with error message from passengerRequestStatus
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
          const waitingResult = await updateDriverWaittingStatus(
            waitUniqueId,
            "requested"
          );
        } else {
          // Respond with error message from decisionResult
          return decisionResult;
        }
      }
      return {
        decision,
        driverWaiting,
        passenger: passenger.length > 0 ? passenger?.at(0) : null,
        message: "success",
        data: "Driver wait registered successfully",
      };
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
    const { driverUniqueId } = req.user.data;
    // console.log("driverUniqueId", driverUniqueId);
    const sqlToVerifyWaiting = `SELECT * FROM driverWaits WHERE driverUniqueId = ? order by waitId desc limit 1 `;
    const [driverWaitResult] = await pool.query(sqlToVerifyWaiting, [
      driverUniqueId,
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
        const sqlToGetPassengerRequest = `select * from passengerRequests,passenger where requestUniqueId = ? and passenger.passengerUniqueId = passengerRequests.passengerUniqueId`;
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
          driverWaiting,
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
          driverWaiting,
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
        const passengerRequestResult = await updatePassengerRequestStatus(
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
          driverWaiting,
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
    const { decisionUniqueId, requestUniqueId, waitUniqueId } = req.body;

    // console.log("req.body", req.body);
    // return;
    const driverWaitStatus = await updateDriverWaittingStatus(
      waitUniqueId,
      "driver cancelled"
    );
    const passangerRequsetStatus = await updatePassengerRequestStatus(
      requestUniqueId,
      "waiting"
    );
    const decisionStatus = await updateDecisionStatus(
      decisionUniqueId,
      "driver cancelled"
    );

    console.log("passangerRequsetStatus", passangerRequsetStatus);
    console.log("decisionStatus", decisionStatus);
    console.log("driverWaitStatus", driverWaitStatus);
    if (
      passangerRequsetStatus.affectedRows > 0 &&
      decisionStatus.affectedRows > 0
    ) {
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
    const updateResultOfPassangerRequest = await updatePassengerRequestStatus(
      requestUniqueId,
      "accepted"
    );

    const updateResultOfDriverWaiting = await updateDriverWaittingStatus(
      waitUniqueId,
      "accepted"
    );

    if (
      updateResultOfDecision.affectedRows >= 0 &&
      updateResultOfDriverWaiting.affectedRows >= 0 &&
      updateResultOfPassangerRequest.affectedRows >= 0
    ) {
      const result = await sendAcceptanceNotificationToPassanger(req);
      console.log(
        "result on sendAcceptanceNotificationToPassanger =====",
        result
      );
      return result;
    } else {
      return { message: "error", error: "Request acceptance failed" };
    }
  } catch (error) {
    console.log("  error @acceptPassangersRequest", error);
    return { message: "error", error: "Request acceptance failed" };
  }
};
const sendAcceptanceNotificationToPassanger = async (req) => {
  // update request table status
  const passangerInfo = req?.body;
  const driver = req?.user?.data;
  const message = {
    driver,
    passanger: passangerInfo,
    message: "success",
    data: "Request accepted successfully",
  };
  listOfPassangerWs.forEach((passanger) => {
    if (passanger.phoneNumber == passengerPhone) {
      WSServerTextMessageResponder(passanger.WS, message);
    }
  });
  return { message: "success", data: "Request accepted successfully" };
};

const startJourney = async (req) => {
  try {
    const { waitUniqueId, requestUniqueId, decisionUniqueId } = req.body;
    console.log("Request body:", req.body);

    // Update statuses for driver, passenger, and decision
    const waitStatusResult = await updateDriverWaittingStatus(
      waitUniqueId,
      "journey started"
    );
    const passengerRequestStatus = await updatePassengerRequestStatus(
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
      passengerRequestStatus.affectedRows > 0 &&
      decisionStatusResult.affectedRows > 0
    ) {
      // Insert new journey record
      const now = getFormattedDateTime();
      const journeyUniqueId = uuidv4();
      const sqlToStartJourney = `INSERT INTO journeys (journeyUniqueId, decisionUniqueId, startTime, status) VALUES (?, ?, ?, ?)`;
      const values = [
        journeyUniqueId,
        decisionUniqueId,
        now,
        "journey started",
      ];

      const [journeyInsertResult] = await pool.query(sqlToStartJourney, values);

      if (journeyInsertResult.affectedRows > 0) {
        const journeyData = {
          journeyUniqueId: journeyUniqueId,
          decisionUniqueId: decisionUniqueId,
          startTime: now,
          status: "journey started",
        };
        return {
          message: "success",
          data: "Journey started successfully",
          journey: journeyData,
        };
      } else {
        return { message: "error", error: "Failed to start journey" };
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
    const decisionStatus = await updateDecisionStatus(
      decisionUniqueId,
      "completed"
    );
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
    const passengerRequestStatus = await updatePassengerRequestStatus(
      requestUniqueId,
      "completed"
    );
    if (passengerRequestStatus.affectedRows === 0) {
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
    if (journeyStatusResult.affectedRows === 0) {
      return { message: "error", error: "Failed to update journey status" };
    }

    return { message: "success", data: "Journey completed successfully" };
  } catch (error) {
    console.error("Error completing journey:", error);
    return { message: "error", error: "Failed to complete journey" };
  }
};

const verifyExistanceOfPassangerInDecision = async (requestUniqueId) => {
  // write a function to check if requestUniqueId or waitUniqueId is present in journeyDecisions
  const sqlToGetDecisionStatus = `select * from journeyDecisions  where passengerRequestUniqueId = ? and decision   in ( 'waiting','accepted','journey started')`;
  const [rows] = await pool.query(sqlToGetDecisionStatus, [requestUniqueId]);
  console.log("rows of verifyExistanceOfPassangerInDecision==", rows);
  return rows;
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
  verifyDriverByOTP,
  registerDriver,
  checkGetMethodes,
};
