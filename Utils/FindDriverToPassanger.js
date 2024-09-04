const { verifyExistanceOfData } = require("../CRUD/Read/ReadData");
const {
  updateDriverWaittingStatus,
  updateuserJourneyStatus,
} = require("../CRUD/Update/Data.update");
const { pool } = require("../Middleware/Database.config");
const registerDecision = require("../Utils/registerDecision");

const FindDriverForPassenger = async (requestUniqueId) => {
  try {
    let responseData = {
      driver: null,
      decision: null,
      passenger: null,
      status: "waiting",
    };

    // Fetch the latest driver who is waiting
    const sqlToGetDriverWaiting = `SELECT * FROM Requests JOIN Users ON Requests.userUniqueId = Users.userUniqueId 
      WHERE requestType = 'DRIVER' AND journeyStatusId = '1' ORDER BY requestId DESC 
      LIMIT 1`;

    const [searchedDriverData] = await pool.query(sqlToGetDriverWaiting);
    return searchedDriverData?.at(0);
    // if (searchedDriverData.length > 0) {
    //   const { waitUniqueId } = searchedDriverData[0];

    //   // Update passenger and driver statuses
    //   await updateuserJourneyStatus(requestUniqueId, "requested");
    //   await updateDriverWaittingStatus(waitUniqueId, "requested");

    //   // Register the decision made by the passenger
    //   const decisionResult = await registerDecision({
    //     requestUniqueId,
    //     waitUniqueId,
    //     actor: "passenger",
    //   });

    //   responseData.status = "requested";
    //   responseData.decision = decisionResult;

    //   // Fetch the driver details

    //   responseData.driver = await verifyExistanceOfData({
    //     tableName: "DriverWait",
    //     conditions: {
    //       waitUniqueId,
    //     },
    //   });
    // }

    // responseData.passenger = await verifyExistanceOfData({
    //   tableName: "PassengerRequest",
    //   conditions: {
    //     requestUniqueId,
    //   },
    // });
    // return {
    //   message: "success",
    //   ...responseData,
    // };
  } catch (error) {
    console.error("Error finding driver:", error);
    return {
      message: "error",
      error: "Unable to find driver",
    };
  }
};

module.exports = FindDriverForPassenger;
