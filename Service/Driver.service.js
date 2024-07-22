const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const {
  WsServerSMSResponder,
  WSServerTextMessageResponder,
  listOfPassangerWs,
} = require("../Utils/WsServerResponder");
const verifyDriverExistence = require("../Middleware/verifyDriverExistence");
const { deleteFile } = require("../Utils/fileUtils");
const createJWT = require("../Utils/createJWT");
const { verifyExistanceOfDriversWaiting } = require("../Utils/DriversWSUtils");
const FindPassangerForDriver = require("../Utils/FindPassangerForDriver");
const registerDecision = require("../Utils/registerDecision");

const checkGetMethodes = async () => {
  return {
    message: "success",
    data: "checkGetMethodes",
  };
};

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
    console.log("existingDrivers", existingDrivers);
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

const cancelWaittingRequest = async (req) => {
  try {
    const body = req?.body;
    let requestUniqueId = null;
    if (body?.length > 0) {
      requestUniqueId = body?.at(0).requestUniqueId;
    }
    const userData = req?.user?.data;
    if (!userData) {
      return { message: "error", error: "User not found" };
    }
    const { driverUniqueId } = userData;
    const sql = `UPDATE driverWaits SET status = 'cancelled' WHERE driverUniqueId = ? and (status = 'waiting' or status = 'accepted') `;
    const value = [driverUniqueId];
    const [rows] = await pool.query(sql, value);
    console.log("rows", rows);
    if (rows.affectedRows > 0) {
      // if there is no passanger return success no need of cancillation
      if (requestUniqueId == null) {
        return { message: "success", data: "Request canceled successfully" };
      }
      const sqlToUpdatePassangersRequest = `update passengerRequests set status = 'cancelled' where  requestUniqueId=?`;
      const value2 = [requestUniqueId];
      const [rows2] = await pool.query(sqlToUpdatePassangersRequest, value2);
      if (rows2.affectedRows > 0) {
        return { message: "success", data: "Request canceled successfully" };
      }
      return { message: "error", data: "Request canceled failed" };
    } else {
      return { message: "error", error: "Request cancellation failed" };
    }
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
    const existanceOfDriver = await verifyExistanceOfDriversWaiting(
      driverUniqueId
    );
    // if there is no existance of driver in waiting, register driver in waiting
    let insertedRows = { affectedRows: 0 };
    if (existanceOfDriver?.length == 0) {
      const sql = `INSERT INTO driverWaits (waitUniqueId,driverUniqueId, waitLatitude, waitLongitude) VALUES (?, ?,?, ?)`;
      const value = [waitUniqueId, driverUniqueId, latitude, longitude];
      const [rows] = await pool.query(sql, value);
      insertedRows = rows;
    } else {
      console.log("existanceOfDriver", existanceOfDriver);
      waitUniqueId = existanceOfDriver[0].waitUniqueId;
    }
    if (insertedRows.affectedRows > 0 || existanceOfDriver?.length > 0) {
      let passenger = await FindPassangerForDriver();
      console.log("passenger", passenger);
      if (passenger?.length > 0) {
        // register decision to agree with passenger or not to agree
        const requestUniqueId = passenger.at(0).requestUniqueId;
        const decisionResult = await registerDecision({
          requestUniqueId,
          waitUniqueId,
          actor: "driver",
        });
        console.log("decisionResult======", decisionResult);
        if (decisionResult.message == "success") {
          passenger[0].decisionUniqueId = decisionResult.decisionUniqueId;
          passenger[0].waitUniqueId = waitUniqueId;
        }
        // respond error message from decisionResult
        else return decisionResult;
      }
      return {
        passenger,
        message: "success",
        data: "Driver wait registered successfully",
      };
    } else
      return { message: "error", data: "Driver can't connect to start job" };
  } catch (error) {
    console.error("Error inserting driver wait data:", error);
    return { message: "error", data: "Driver can't connect to start job" };
  }
};
const verifyStatusOfDriver = async (req) => {
  try {
    const { driverUniqueId } = req.user.data;
    console.log("driverUniqueId", driverUniqueId);
    const sql = `SELECT * FROM driverWaits WHERE driverUniqueId = ? order by waitId desc limit 1 `;
    const [driverWaitResult] = await pool.query(sql, [driverUniqueId]);
    console.log("driverWaitResult", driverWaitResult);
    let status = null,
      waitUniqueId = null;
    if (driverWaitResult?.length > 0) {
      status = driverWaitResult?.at(0)?.status;
      waitUniqueId = driverWaitResult?.at(0)?.waitUniqueId;
    } else {
      return { message: "error", error: "Driver not found" };
    }
    if (status == "accepted" || status == "journey started") {
      const waitUniqueId = driverWaitResult[0].waitUniqueId;
      const sqlToGetDecisionStatus = `select * from journeyDecisions  where driverWaitUniqueId = ?`;
      const [rows] = await pool.query(sqlToGetDecisionStatus, waitUniqueId);
      console.log("rows", rows);
      if (rows?.length > 0) {
        const passengerRequestUniqueId = rows?.at(0)?.passengerRequestUniqueId;

        const sqlToGetPassengerRequest = `select * from passengerRequests where requestUniqueId = ?`;
        const [passengerRequest] = await pool.query(sqlToGetPassengerRequest, [
          passengerRequestUniqueId,
        ]);
        if (passengerRequest.length == 0)
          return {
            message: "error",
            error: "Unable to get passenger request data",
          };
        const passengerUniqueId = passengerRequest?.at(0)?.passengerUniqueId;
        const sqlToGetPassenger = `select * from passenger where passengerUniqueId = ?`;
        const [passenger] = await pool.query(sqlToGetPassenger, [
          passengerUniqueId,
        ]);
        if (passenger?.length == 0)
          return { message: "error", error: "Unable to get passenger data" };
        return {
          message: "success",
          status,
          passenger: [
            { ...passenger[0], ...passengerRequest[0], ...driverWaitResult[0] },
          ],
        };
      } else {
        return { message: "error", error: "Unable to verify current status" };
      }
    } else if (status == "waiting") {
      // findPassangerForDriver
      const passenger = await FindPassangerForDriver();
      // register decision to agree with passenger or not to agree
      const requestUniqueId = passenger.at(0).requestUniqueId;
      let decisionResult = await verifyExistanceOfPassangerInDecision(
        requestUniqueId
      );
      console.log("decisionResult========", decisionResult);
      if (decisionResult?.length == 0) {
        decisionResult = await registerDecision({
          requestUniqueId,
          waitUniqueId,
          actor: "driver",
        });
      }
      console.log("decisionResult======", decisionResult);
      console.log("FindPassangerForDriver", passenger);
      if (decisionResult.message == "success") {
        passenger[0].decisionUniqueId = decisionResult.decisionUniqueId;
        passenger[0].waitUniqueId = waitUniqueId;
        return { message: "success", status, passenger };
      } else {
        return { message: "error", error: "Unable to verify current status" };
      }
    } else
      return { message: "error", error: "Unable to verify current status" };
  } catch (error) {
    console.error("Error in cancelWaittingRequest:", error.message);
    return { message: "error", error: "Unable to verify current status" };
  }
};
const rejectPassangersRequest = async (req) => {
  try {
    const { decisionUniqueId } = req.body;
    console.log("req.body in rejectPassangersRequest======> ", req.body);
    const sqlToUpdateDecision = `update journeyDecisions set decision = 'rejected' where  decision = 'pending' and decisionUniqueId=?`;
    const value = [decisionUniqueId];
    const [rows] = await pool.query(sqlToUpdateDecision, value);
    console.log("rows", rows);
    if (rows.affectedRows > 0) {
      return { message: "success", data: "Request rejected successfully" };
    } else {
      return { message: "error", error: "Request rejection failed" };
    }
  } catch (error) {
    return { message: "error", error: "Request rejection failed" };
  }
};
const acceptPassangersRequest = async (req) => {
  try {
    // console.log(`req.user ===========> `, req.user);
    // return "acceptPassangersRequest";
    const { decisionUniqueId, waitUniqueId } = req.body;
    console.log("req.body", req.body);
    console.log("waitUniqueId=========>", waitUniqueId);
    const sqlToUpdateDecision = `update journeyDecisions set decision = 'accepted' where  decision = 'pending' and decisionUniqueId=?`;
    const value = [decisionUniqueId];
    const [rows] = await pool.query(sqlToUpdateDecision, value);
    console.log("rows", rows);
    const sqlToUpdateWaitingRequest = `update driverWaits set status = 'accepted' where  waitUniqueId=?`;
    const value2 = [waitUniqueId];
    const [rows2] = await pool.query(sqlToUpdateWaitingRequest, value2);
    console.log("rows2", rows2);
    return { message: "success", data: "Request accepted successfully" };
    if (rows.affectedRows >= 0) {
      const result = await sendAcceptanceNotificationToPassanger(req);
      return result;
    } else {
      return { message: "error", error: "Request acceptance failed" };
    }
  } catch (error) {
    return { message: "error", error: "Request acceptance failed" };
  }
};
const sendAcceptanceNotificationToPassanger = async (req) => {
  // update request table status
  const passangerInfo = req?.body;
  const driver = req?.user?.data;
  const sqlToUpdateRequest = `update passengerRequests set status = 'accepted' where  requestUniqueId=?`;
  const value = [passangerInfo?.requestUniqueId];
  const passengerPhone = passangerInfo?.passengerPhone;
  const [rows] = await pool.query(sqlToUpdateRequest, value);
  if (rows.affectedRows > 0) {
    const message = {
      driver,
      passanger: passangerInfo,
      message: "success",
      data: "Request accepted successfully",
    };
    console.log("first message", message);
    listOfPassangerWs.forEach((passanger) => {
      if (passanger.phoneNumber == passengerPhone) {
        WSServerTextMessageResponder(passanger.WS, message);
      }
    });
    return { message: "success", data: "Request accepted successfully" };
    // send notification to passanger
  } else {
    return { message: "error", error: "unable to update passanger" };
  }
};

const startJourney = async (req) => {
  try {
    const { waitUniqueId, requestUniqueId, decisionUniqueId } = req.body;
    console.log(" req.body===========", req.body);
    const sqlToUpdateJourney = `update driverWaits set status = 'journey started' where  waitUniqueId=?`;
    const value = [waitUniqueId];
    const [rows] = await pool.query(sqlToUpdateJourney, value);
    const sqlToUpdatePassangersRequest = `update passengerRequests set status = 'journey started' where  requestUniqueId=?`;
    const value2 = [requestUniqueId];
    // requestUniqueId;
    if (rows.affectedRows > 0) {
      const [rows2] = await pool.query(sqlToUpdatePassangersRequest, value2);
      if (rows2.affectedRows > 0) {
        const now = getFormattedDateTime();
        const journeyUniqueId = uuidv4();
        const sqlToStartJourney = `insert into journey (journeyUniqueId,decisionUniqueId,startTime,status ) values (?,?)`;
        const value3 = [journeyUniqueId, decisionUniqueId, now, waitUniqueId];
        const [rows3] = await pool.query(sqlToStartJourney, value3);
        if (rows3.affectedRows > 0) {
          return { message: "success", data: "Journey started successfully" };
        } else {
          return { message: "error", error: "Journey start failed" };
        }
      } else {
        return { message: "error", error: "Journey start failed" };
      }
    } else {
      return { message: "error", error: "Journey start failed" };
    }
  } catch (error) {
    console.log(error);
    return { message: "error", error: "Journey start failed" };
  }
};
const driverArrivedDestination = async (req) => {
  try {
    const { waitUniqueId, requestUniqueId, decisionUniqueId, journeyUniqueId } =
      req.body;
    console.log(" req.body===========", req.body);
    const sqlToUpdateJourney = `update driverWaits set status = 'destination reached' where  waitUniqueId=?`;
    const value = [waitUniqueId];
    const [rows] = await pool.query(sqlToUpdateJourney, value);
    const sqlToUpdatePassangersRequest = `update passengerRequests set status = 'destination reached' where  requestUniqueId=?`;
    const value2 = [requestUniqueId];
    // requestUniqueId;
    if (rows.affectedRows > 0) {
      const [rows2] = await pool.query(sqlToUpdatePassangersRequest, value2);
      if (rows2.affectedRows > 0) {
        // const journeyUniqueId = uuidv4();
        const sqlToUpdateJourney = `update  journey  set status =? where journeyUniqueId=?`;
        const value3 = ["completed", journeyUniqueId];
        const [rows3] = await pool.query(sqlToUpdateJourney, value3);
        if (rows3.affectedRows > 0) {
          return { message: "success", data: "Journey started successfully" };
        } else {
          return { message: "error", error: "Journey start failed" };
        }
      } else {
        return { message: "error", error: "Journey start failed" };
      }
    } else {
      return { message: "error", error: "Journey start failed" };
    }
  } catch (error) {
    console.log(error);
    return { message: "error", error: "Journey start failed" };
  }
};
const verifyExistanceOfPassangerInDecision = async (requestUniqueId) => {
  // write a function to check if requestUniqueId or waitUniqueId is present in journeyDecisions
  const sqlToGetDecisionStatus = `select * from journeyDecisions  where passengerRequestUniqueId = ?`;
  const [rows] = await pool.query(sqlToGetDecisionStatus, requestUniqueId);
  console.log("rows", rows);
  return rows;
};
module.exports = {
  driverArrivedDestination,
  startJourney,
  rejectPassangersRequest,
  acceptPassangersRequest,
  verifyStatusOfDriver,
  registerDriverToGetPassengerRequest,
  cancelWaittingRequest,
  verifyDriverByOTP,
  registerDriver,
  checkGetMethodes,
};
