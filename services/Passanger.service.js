// passengers.service.js

const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const {
  sendOtpViaWebSocket,
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
  verifyExistanceOfData,
} = require("../CRUD/Read/ReadData");
const {
  updateDriverWaittingStatus,
  updateJourneyStatus,
  updateDecisionStatus,
  updateuserJourneyStatus,
  updateOTPToUsersCredentials,
} = require("../CRUD/Update/Data.update");
const { getListOfVechleType } = require("./VechleType.service");
const { getCancilationReasons } = require("./Cancilation.service");
const {
  registerCanceledJourney,
  registerUserToUsersTable,
} = require("../CRUD/Create/CreateData");
const getFormattedDateTime = require("../Utils/currentDate");

// Service to get many passengers
const getManyPassengers = async () => {};

// Service to get one passenger by ID
const getOnePassenger = async (id) => {};

// Service to update a passenger by ID
const updateOnePassenger = async (id, data) => {};
const verifyPassangersOTP = async (body) => {
  const { passengerPhone, passengerOTP } = body;
  const sql = `SELECT * FROM usersCredential,Users WHERE (Users.phoneNumber=? OR Users.email=?) AND usersCredential.OTP=? and Users.userUniqueId=usersCredential.userUniqueId`;
  const values = [passengerPhone, passengerPhone, passengerOTP];
  const [result] = await pool.query(sql, values);
  if (result.length > 0) {
    const { passengerFullName, passengerEmail, userUniqueId } = result[0];
    const passengersToken = createJWT({
      passengerPhone,
      passengerFullName,
      passengerEmail,
      userUniqueId,
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
    const userUniqueId = result[0].userUniqueId;
    return {
      isFound: true,
      userUniqueId,
    };
  } else {
    return { isFound: false };
  }
};

// Service to register a new passenger

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
const usersRequest = async (body, user) => {
  try {
    const { userUniqueId } = user?.data;
    let passenger = null,
      status = null,
      driver = null,
      decision = null,
      journey = null;
    // create a function if a passanger is in waiting stage or not in table PassengerRequest , where passangers userUniqueId

    const existedUser = await verifyExistanceOfData({
      tableName: "Users",
      conditions: { userUniqueId },
    });
    console.log("foundResult ========> ", foundResult);
    if (existedUser.length <= 0)
      return { message: "error", error: "user not found" };
    //  message: "success";
    const foundResult = await verifyExistanceOfData({
      tableName: "Requests",
      conditions: { userUniqueId },
    });
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
      "insert into PassengerRequest (requestUniqueId,userUniqueId, vehicleTypeId, originLatitude,originLongitude, originPlace, destinationLatitude,destinationLongitude, destinationPlace,userJourneyStatusId) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
    const values = [
      uniqueid,
      userUniqueId,
      vechle.vehicleTypeId,
      originLocation.latitude,
      originLocation.longitude,
      originLocation.description,
      destination.latitude,
      destination.longitude,
      destination.description,
      1,
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
    console.log("@usersRequest catch error", error);
    return { message: "error", error: "unable to create request" };
  }
};
const verifyStatusOfPassenger = async (req) => {
  try {
    console.log("in verifyStatusOfPassenger", req.user.data.userUniqueId);
    const userUniqueId = req?.user?.data?.userUniqueId;

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

    const sqlToGetPassangerData = `select * from PassengerRequest,passenger where Users.userUniqueId = ? and Users.userUniqueId = PassengerRequest.userUniqueId order by requestId desc limit 1 `;
    const [passengerInfo] = await pool.query(sqlToGetPassangerData, [
      userUniqueId,
    ]);

    if (passengerInfo.length > 0) {
      const vehicleTypeUniqueId = passengerInfo[0]?.vehicleTypeUniqueId;
      const requestUniqueId = passengerInfo[0]?.requestUniqueId;
      passangerStatus = passengerInfo[0]?.status;
      passenger = passengerInfo[0];
      console.log("passangerStatus", passangerStatus);
      if (passangerStatus == "waiting") {
        const searchedDriverData = await FindDriverForPassanger(
          "requestUniqueId",
          requestUniqueId
        );
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
    const body = req.body;
    const requestUniqueId = body?.requestUniqueId,
      decisionUniqueId = body?.decisionUniqueId,
      journeyUniqueId = body?.journeyUniqueId,
      waitUniqueId = body?.waitUniqueId,
      cancilationReasonTypeUniqueId = body?.cancilationReasonTypeUniqueId,
      driverPhoneNumber = body?.driverPhoneNumber;
    // console.log("driverPhoneNumber", driverPhoneNumber);
    // return;
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
      const requestStatus = await updateuserJourneyStatus(
        requestUniqueId,
        "cancelled by passenger"
      );

      console.log("requestStatus", requestStatus);
    }
    if (driverPhoneNumber)
      sendNotificationToDriver({
        message: { status: "cancelled by passenger" },
        phoneNumber: driverPhoneNumber,
      });
    console.log("sendNotificationToDriver it is good ");
    return { message: "success", data: "cancelled by passenger" };
  } catch (error) {
    console.log("first catch error", error);
  }
};

module.exports = {
  cancelRequest,
  verifyStatusOfPassenger,
  usersRequest,
  getManyPassengers,
  getOnePassenger,
  deletePassenger,
  updateOnePassenger,
  verifyPassangersOTP,
};
