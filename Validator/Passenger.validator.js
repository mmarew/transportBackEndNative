const { pool } = require("../Middleware/Database.config");

const verifyExistanceOfPassangerInWaitingStage = async (passengerUniqueId) => {
  // Query to check existence in the passenger table
  const passengerSql = `SELECT * FROM passenger WHERE passengerUniqueId = ?`;
  const passengerValues = [passengerUniqueId];
  const [passengerResult] = await pool.query(passengerSql, passengerValues);

  if (passengerResult.length === 0) {
    // If no passenger found, return an empty result

    return { message: "error", error: "passenger not found" };
  }

  // Query to check existence in the passengerRequests table
  const requestSql = `SELECT * FROM passengerRequests WHERE passengerUniqueId = ? AND status IN ('waiting', 'requested', 'accepted','journey started')`;
  const requestValues = [passengerUniqueId];
  const [requestResult] = await pool.query(requestSql, requestValues);

  // Combine the results (if necessary) or return the request results directly
  if (requestResult.length > 0) {
    return {
      message: "success",
      passenger: { ...requestResult[0], ...passengerResult[0] },
      data: "passenger is in waiting stage",
    };
  } else {
    return {
      message: "success",
      passenger: { ...passengerResult[0] },
      data: "passenger is not in waiting stage",
    };
  }
};

module.exports = { verifyExistanceOfPassangerInWaitingStage };
