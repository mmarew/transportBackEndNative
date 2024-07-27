// passengers.service.js

const { pool } = require("../Middleware/Database.config");
const { v4: uuidv4 } = require("uuid");
const { WsServerSMSResponder } = require("../Utils/WsServerResponder");
const createJWT = require("../Utils/createJWT");
const FindDriverForPassanger = require("../Utils/FindDriverToPassanger");
const {
  verifyExistanceOfPassangerInWaitingStage,
} = require("../Validator/Passenger.validator");

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
    const { passengerUniqueId } = user?.data;
    // create a function if a passanger is in waiting stage or not in table passengerRequests , where passangers passengerUniqueId

    const foundResult = await verifyExistanceOfPassangerInWaitingStage(
      passengerUniqueId
    );
    console.log("@registerPassangerRequestToGetCars body =====> ", body);
    if (foundResult.length > 0) {
      return {
        message: "success",
        data: "passanger is already in waiting stage",
      };
    }
    const uniqueid = uuidv4();
    const passangersState = body.passangersState;
    const { destination, vechle, originLocation } = passangersState;
    console.log("originLocation", originLocation);
    if (originLocation == null || destination == null || vechle == null) {
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
    const [queryResult] = await pool.query(sqlToInsert, values);
    console.log("inserts queryResult=====>", queryResult);
    if (queryResult.affectedRows > 0) {
      const driver = await FindDriverForPassanger(body);
      return {
        mesage: "success",
        data: "passanger registered successfully",
        driver,
      };
    } else return { message: "error", error: "unable to create request" };
  } catch (error) {
    console.log("@registerPassangerRequestToGetCars catch error", error);
    return { message: "error", error: "unable to create request" };
  }
};
module.exports = {
  registerPassangerRequestToGetCars,
  getManyPassengers,
  getOnePassenger,
  registerPassenger,
  deletePassenger,
  updateOnePassenger,
  verifyPassangersOTP,
};
