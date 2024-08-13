// passengers.service.js

const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  WsServerSMSResponder,
  listOfDriverWs,
  WSServerTextMessageResponder,
} = require("../Utils/WsServerResponder");
const createJWT = require("../Utils/createJWT");
const FindDriverForPassanger = require("../Utils/FindDriverToPassanger");
const {
  verifyExistanceOfPassangerInWaitingStage,
} = require("../Validator/Passenger.validator");
const {
  getDataOfVehicleTypes,
  getDataOfSingleDecision,
  getDataOfSingleDriverWaiting,
  getSingleDataOfJourney,
  getSingleDataOfPassengerRequest,
} = require("../CRUD/Read/ReadData");
const {
  updateDriverWaittingStatus,
  updateJourneyStatus,
  updateDecisionStatus,
  updatePassengerRequestStatus,
} = require("../CRUD/Update/Driver.update");
const { getListOfVechleType } = require("./VechleType.service");
const { getCancilationReasons } = require("./Cancilation.service");
const { registerCanceledJourney } = require("../CRUD/Create/CreateData");
const getFormattedDateTime = require("../Utils/currentDate");

// Service to get many passengers
const getManyPassengers = async () => {};

// Service to get one passenger by ID
const getOnePassenger = async (id) => {};

// Service to update a passenger by ID
const updateOnePassenger = async (id, data) => {};
const verifyPassangersOTP = async (body) => {
  const { passengerPhone, passengerOTP } = body;
  const sql = `SELECT * FROM passengerCredentials, passenger WHERE passenger.passengerPhone=? AND passengerCredentials.passengerOTP=? and passenger.passengerUniqueId=passengerCredentials.passengerUniqueId`;
  const values = [passengerPhone, passengerOTP];
  const [result] = await pool.query(sql, values);
  if (result.length > 0) {
    const { passengerFullName, passengerEmail, passengerUniqueId } = result[0];
    const passengersToken = createJWT({
      passengerPhone,
      passengerFullName,
      passengerEmail,
      passengerUniqueId,
    });
    return {
      passengersToken,
      message: "success",
      detail: "passenger verified successfully",
    };
  } else {
    return { message: "error", error: "passenger OTP verification failed" };
  }
};
const verifyExistanceOfPassanger = async (email, phone) => {
  const findPassanger = `SELECT * FROM passenger WHERE passengerEmail=? or passengerPhone=?`;
  const values = [email, phone];
  const [result] = await pool.query(findPassanger, values);
  if (result.length > 0) {
    const passengerUniqueId = result[0].passengerUniqueId;
    return {
      isFound: true,
      passengerUniqueId,
    };
  } else {
    return { isFound: false };
  }
};
const updatePassangersOTP = async (passengerUniqueId, phoneNumber, OTP) => {
  const sql = `UPDATE passengerCredentials SET passengerOTP=? WHERE passengerUniqueId=?`;
  const values = [OTP, passengerUniqueId];
  const [result] = await pool.query(sql, values);
  if (result.affectedRows > 0) {
    return WsServerSMSResponder(phoneNumber, OTP);
  } else {
    return {
      message: "error",
      error: "unable to create otp",
    };
  }
};
// Service to register a new passenger
const registerPassenger = async (body) => {
  const { passengerFullName, passengerEmail, passengerPhone } = body;
  const sixDigitPinCode = Math.floor(100000 + Math.random() * 900000);
  const passangerData = await verifyExistanceOfPassanger(
    passengerEmail,
    passengerPhone
  );
  if (passangerData?.isFound == true) {
    return await updatePassangersOTP(
      passangerData.passengerUniqueId,
      passengerPhone,
      sixDigitPinCode
    );
  }
  const sql = `INSERT INTO passenger (passengerFullName, passengerEmail, passengerPhone, passengerUniqueId)
VALUES (?,?,?,?)`;
  const uuid = uuidv4();
  const values = [passengerFullName, passengerEmail, passengerPhone, uuid];
  const [result] = await pool.query(sql, values);
  if (result.affectedRows > 0) {
    const sqlToCredential = `INSERT INTO passengerCredentials (passengerUniqueId, passengerOTP) values (?,?)`;

    const [resultOfCredentials] = await pool.query(sqlToCredential, [
      uuid,
      sixDigitPinCode,
    ]);
    if (resultOfCredentials.affectedRows > 0) {
      WsServerSMSResponder(passengerPhone, sixDigitPinCode);
      return {
        message: "success",
        data: "Passenger registered successfully",
      };
    } else {
      // remove passenger from database if otp creation failed
      deletePassenger(uuid);
      return { message: "error", data: "Passenger registration failed" };
    }
  } else {
    return { message: "error", data: "Passenger registration failed" };
  }
};

// Service to delete a passenger by ID
const deletePassenger = async (uuid) => {
  const sqlToDeletePassenger = `DELETE FROM passenger WHERE passengerId=?`;
  const values = [uuid];
  const [result] = await pool.query(sqlToDeletePassenger, values);
  if (result.affectedRows > 0) {
    return {
      message: "success",
      data: "Passenger deleted successfully",
    };
  } else {
    return { message: "error", data: "Passenger deletion failed" };
  }
};
const registerPassangerRequestToGetCars = async (body, user) => {
  try {
    // return;
    const { passengerUniqueId } = user?.data;
    let passenger = null,
      status = null,
      driver = null,
      decision = null,
      journey = null;
    // create a function if a passanger is in waiting stage or not in table passengerRequests , where passangers passengerUniqueId

    const foundResult = await verifyExistanceOfPassangerInWaitingStage(
      passengerUniqueId
    );
    console.log("foundResult ========> ", foundResult);
    if (foundResult.message == "error") return foundResult;
    //  message: "success";
    if (foundResult?.message == "success") {
      passenger = foundResult?.passenger;
      status = passenger?.status;
      const data = foundResult?.data;
      const requestUniqueId = passenger?.requestUniqueId;
      if (data == "passenger is in waiting stage") {
        if (
          status == "requested" ||
          status == "accepted" ||
          status == "journey started"
        ) {
          decision = await getDataOfSingleDecision(
            "passengerRequestUniqueId",
            requestUniqueId
          );
          const decisionUniqueId = decision?.decisionUniqueId;
          driverWaitUniqueId = decision?.driverWaitUniqueId;
          driver = await getDataOfSingleDriverWaiting(
            "waitUniqueId",
            driverWaitUniqueId
          );
          journey = await getSingleDataOfJourney(
            "decisionUniqueId",
            decisionUniqueId
          );
          console.log(" driver?.phoneNumber", driver?.phoneNumber);
          sendNotificationToDriver({
            phoneNumber: driver?.phoneNumber,
            message: {
              status,
              journey: journey,
              decision: decision,
              passenger,
              driver,
            },
          });

          return {
            passenger,
            status,
            message: "success",
            data: "passanger is in waiting stage",
            decision,
            driver,
            journey,
          };
        }

        return {
          passenger,
          status,
          driver,
          journey,
          message: "success",
          data: "passanger is already in waiting stage",
        };
      }
    }
    const uniqueid = uuidv4();
    const passengerState = body.passengerState;
    if (!passengerState) {
      return {
        message: "error",
        error: "please provide passengerState",
      };
    }
    const { destination, vechle, originLocation } = passengerState;
    if (originLocation == null || destination == null || vechle == null) {
      console.log("first");
      return {
        message: "error",
        error: "please provide current location, destination and vechle",
      };
    }
    const sqlToInsert =
      "insert into passengerRequests (requestUniqueId,passengerUniqueId,vehicleTypeUniqueId,originLatitude,originLongitude,originPlace,destinationLatitude,destinationLongitude,destinationPlace) values (?,?,?,?,?,?,?,?,?)";
    const values = [
      uniqueid,
      passengerUniqueId,
      vechle.vehicleTypeUniqueId,
      originLocation.latitude,
      originLocation.longitude,
      originLocation.description,
      destination.latitude,
      destination.longitude,
      destination.description,
    ];

    const [resultOfRegisterPassenger] = await pool.query(sqlToInsert, values);
    if (resultOfRegisterPassenger.affectedRows > 0) {
      const responceData = await FindDriverForPassanger(uniqueid);
      console.log("in FindDriverForPassanger responceData", responceData);
      // return;
      status = responceData?.passenger?.status;
      const driverPhoneNumber = responceData?.driver?.phoneNumber;
      if (responceData.message == "success") {
        // sendWSMessageToPassenger fail here
        sendNotificationToDriver({
          message: { ...responceData },
          phoneNumber: driverPhoneNumber,
        });
        return {
          passenger,
          mesage: "success",
          data: "passenger request registered successfully",
          vechle: vechle,
          ...responceData,
          status: status,
        };
      } else {
        return responceData;
      }
    } else return { message: "error", error: "unable to create request" };
  } catch (error) {
    console.log("@registerPassangerRequestToGetCars catch error", error);
    return { message: "error", error: "unable to create request" };
  }
};
const verifyStatusOfPassenger = async (req) => {
  try {
    console.log("in verifyStatusOfPassenger", req.user.data.passengerUniqueId);
    const passengerUniqueId = req?.user?.data?.passengerUniqueId;

    let driver = null,
      decision = null,
      journey = null,
      vecheleType = null,
      passenger = null,
      passangerStatus = null,
      listOfVechlesType = await getListOfVechleType(),
      listOfCancilationReasons = await getCancilationReasons();
    if (listOfCancilationReasons.message == "success")
      listOfCancilationReasons = listOfCancilationReasons?.data;

    const sqlToGetPassangerData = `select * from passengerRequests,passenger where passenger.passengerUniqueId = ? and passenger.passengerUniqueId = passengerRequests.passengerUniqueId order by requestId desc limit 1 `;
    const [passengerInfo] = await pool.query(sqlToGetPassangerData, [
      passengerUniqueId,
    ]);
    console.log("passengerInfo", passengerInfo);
    // return;
    if (passengerInfo.length > 0) {
      const vehicleTypeUniqueId = passengerInfo[0]?.vehicleTypeUniqueId;
      const requestUniqueId = passengerInfo[0]?.requestUniqueId;
      passangerStatus = passengerInfo[0]?.status;
      passenger = passengerInfo[0];
      console.log("passangerStatus", passangerStatus);
      // return;
      if (passangerStatus == "waiting") {
        const searchedDriverData = await FindDriverForPassanger(
          "requestUniqueId",
          requestUniqueId
        );
        console.log("searchedDriverData", searchedDriverData);
        // return;
        driver = searchedDriverData.driver;
        decision = searchedDriverData.decision;
        // vecheles data
        vecheleType = await getDataOfVehicleTypes(
          "vehicleTypeUniqueId",
          vehicleTypeUniqueId
        );
      } else if (passangerStatus == "requested") {
        // decision data
        decision = await getDataOfSingleDecision(
          "passengerRequestUniqueId",
          requestUniqueId
        );
        if (decision) {
          const driverWaitUniqueId = decision?.driverWaitUniqueId;
          driver = await getDataOfSingleDriverWaiting(
            "waitUniqueId",
            driverWaitUniqueId
          );
          console.log("driver ============>", driver);

          // vecheles data
          const vechleInfo = await getDataOfVehicleTypes(
            "vehicleTypeUniqueId",
            vehicleTypeUniqueId
          );
          if (vechleInfo) {
            vecheleType = vechleInfo[0];
          } else vecheleType = null;
        } else {
          decision = null;
          driver = null;
        }
      } else if (passangerStatus == "accepted") {
        decision = await getDataOfSingleDecision(
          "passengerRequestUniqueId",
          requestUniqueId
        );
        // console.log("decision", decision);

        if (decision) {
          const driverWaitUniqueId = decision?.driverWaitUniqueId;
          driver = await getDataOfSingleDriverWaiting(
            "waitUniqueId",
            driverWaitUniqueId
          );

          // vecheles data
          const vechleInfo = await getDataOfVehicleTypes(
            "vehicleTypeUniqueId",
            vehicleTypeUniqueId
          );
          if (vechleInfo) {
            vecheleType = vechleInfo;
          } else vecheleType = null;
        } else {
          decision = null;
          driver = null;
        }
      } else if (passangerStatus == "journey started") {
        decision = await getDataOfSingleDecision(
          "passengerRequestUniqueId",
          requestUniqueId
        );
        // console.log("decision", decision);

        if (decision) {
          const driverWaitUniqueId = decision?.driverWaitUniqueId;
          driver = await getDataOfSingleDriverWaiting(
            "waitUniqueId",
            driverWaitUniqueId
          );
          journey = await getSingleDataOfJourney(
            "decisionUniqueId",
            decision?.decisionUniqueId
          );
          const vechleInfo = await getDataOfVehicleTypes(
            "vehicleTypeUniqueId",
            vehicleTypeUniqueId
          );
          if (vechleInfo) {
            vecheleType = vechleInfo;
          } else vecheleType = null;
        } else {
          decision = null;
          driver = null;
        }
      }
      return {
        listOfCancilationReasons,
        listOfVechlesType,
        vecheleType,
        driver,
        decision,
        journey,
        status: passangerStatus,
        passenger,
        message: "success",
      };
    } else {
      return {
        listOfCancilationReasons,
        listOfVechlesType,
        message: "success",
        data: "driver can start job.",
        status: passangerStatus,
      };
    }
  } catch (error) {
    console.log("first catch error", error);
  }
};
const cancelRequest = async (req) => {
  try {
    console.log("req.body===========>", Object.keys(req.body));
    const body = req.body;
    const requestUniqueId = body?.requestUniqueId,
      decisionUniqueId = body?.decisionUniqueId,
      journeyUniqueId = body?.journeyUniqueId,
      waitUniqueId = body?.waitUniqueId,
      cancilationReasonTypeUniqueId = body?.cancilationReasonTypeUniqueId;
    if (cancilationReasonTypeUniqueId) {
      const cancellationBy = "passenger";
      body.cancellationBy = cancellationBy;
      const cancellationTime = getFormattedDateTime();
      body.cancellationTime = cancellationTime;
      const registerResult = await registerCanceledJourney(body);
      console.log("registerResult=========>", registerResult);
    }
    if (waitUniqueId) {
      const driverStatus = await updateDriverWaittingStatus(
        waitUniqueId,
        "cancelled by passenger"
      );
      console.log("driverStatus", driverStatus);
    }
    if (journeyUniqueId) {
      const journeyStatus = await updateJourneyStatus(
        journeyUniqueId,
        "cancelled by passenger"
      );
      console.log("journeyStatus", journeyStatus);
    }
    if (decisionUniqueId) {
      const decisionStatus = await updateDecisionStatus(
        decisionUniqueId,
        "cancelled by passenger"
      );
      console.log("decisionStatus", decisionStatus);
    }
    if (requestUniqueId) {
      const requestStatus = await updatePassengerRequestStatus(
        requestUniqueId,
        "cancelled by passenger"
      );

      console.log("requestStatus", requestStatus);
    }

    return { message: "success", data: "connected" };
  } catch (error) {
    console.log("first catch error", error);
  }
};
const sendNotificationToDriver = async ({ message, phoneNumber }) => {
  listOfDriverWs.forEach((driver) => {
    if (driver.phoneNumber == phoneNumber) {
      console.log(" phoneNumber in sendNotificattionToDriver", phoneNumber);
      WSServerTextMessageResponder(driver.WS, message);
    }
  });
  return { message: "success", data: "Request accepted successfully" };
};
module.exports = {
  cancelRequest,
  verifyStatusOfPassenger,
  registerPassangerRequestToGetCars,
  getManyPassengers,
  getOnePassenger,
  registerPassenger,
  deletePassenger,
  updateOnePassenger,
  verifyPassangersOTP,
};
