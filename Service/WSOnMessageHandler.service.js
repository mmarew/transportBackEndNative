const { pool } = require("../Middleware/Database.config");
const FindDriverForPassanger = require("../Utils/FindDriverToPassanger");
const FindPassangerForDriver = require("../Utils/FindPassangerForDriver");
const { v4: uuidv4 } = require("uuid");
const registerDecision = require("../Utils/registerDecision");
const { verifyExistanceOfDriversWaiting } = require("../Utils/DriversWSUtils");
const registerPassangerRequest = async (message) => {
  try {
    const passenger = message.user;
    const originLocation = message.originLocation;
    const destination = message.destination;
    const uuid = uuidv4();
    const sql = `INSERT INTO PassengerRequests (requestUniqueId, passengerUniqueId,originLatitude, originLongitude, originPlace, destinationLatitude, destinationLongitude, destinationPlace) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const values = [
      uuid,
      passenger.passengerUniqueId,
      originLocation.latitude,
      originLocation.longitude,
      originLocation.description,
      destination.latitude,
      destination.longitude,
      destination.description,
    ];
    const [result] = await pool.query(sql, values);
    if (result.affectedRows > 0) {
      const driver = await FindDriverForPassanger(message);
      return {
        responseType: "registerPassangerRequestToGetCars",
        message: "success",
        data: "Passenger request registered successfully",
        driver,
      };
    } else {
      return {
        responseType: "registerPassangerRequestToGetCars",
        message: "error",
        data: "Passenger request registration failed",
      };
    }
  } catch (error) {
    return {
      responseType: "registerPassangerRequestToGetCars",
      message: "error",
      data: error,
    };
  }
};

const registerDriverWaiting = async (message) => {
  try {
    const { user, currentLocation } = message;
    console.log("message", message);
    const { driverUniqueId } = user;
    const { latitude, longitude } = currentLocation;
    const waitUniqueId = uuidv4();
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
    }
    if (insertedRows.affectedRows > 0 || existanceOfDriver?.length > 0) {
      let passenger = await FindPassangerForDriver();
      if (passenger?.length > 0) {
        // register decision to agree with passenger or not to agree
        const decisionResult = await registerDecision({
          requestUniqueId,
          waitUniqueId,
          actor: "driver",
        });
        if (decisionResult.message == "success") {
          passenger[0].decisionUniqueId = decisionResult.decisionUniqueId;
        } else return decisionResult;
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

module.exports = { registerPassangerRequest, registerDriverWaiting };
//
