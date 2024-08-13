const {
  getSingleDataOfPassengerRequest,
  getDataOfSingleDriverWaiting,
} = require("../CRUD/Read/ReadData");
const {
  updateDriverWaittingStatus,
  updatePassengerRequestStatus,
} = require("../CRUD/Update/Driver.update");
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
    const sqlToGetDriverWaiting = `
      SELECT * 
      FROM driverWaits
      JOIN driversInfo ON driverWaits.driverUniqueId = driversInfo.driverUniqueId 
      WHERE status = 'waiting' 
      ORDER BY waitId DESC 
      LIMIT 1
    `;
    const [searchedDriverData] = await pool.query(sqlToGetDriverWaiting);

    if (searchedDriverData.length > 0) {
      const { waitUniqueId } = searchedDriverData[0];

      // Update passenger and driver statuses
      await updatePassengerRequestStatus(requestUniqueId, "requested");
      await updateDriverWaittingStatus(waitUniqueId, "requested");

      // Register the decision made by the passenger
      const decisionResult = await registerDecision({
        requestUniqueId,
        waitUniqueId,
        actor: "passenger",
      });

      responseData.status = "requested";
      responseData.decision = decisionResult;

      // Fetch the driver details
      responseData.driver = await getDataOfSingleDriverWaiting(
        "waitUniqueId",
        waitUniqueId
      );
    }

    // Fetch the passenger details
    responseData.passenger = await getSingleDataOfPassengerRequest(
      "requestUniqueId",
      requestUniqueId
    );

    return {
      message: "success",
      ...responseData,
    };
  } catch (error) {
    console.error("Error finding driver:", error);
    return {
      message: "error",
      error: "Unable to find driver",
    };
  }
};

module.exports = FindDriverForPassenger;
