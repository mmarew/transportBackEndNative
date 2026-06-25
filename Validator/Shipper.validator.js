const { pool } = require("../Middleware/Database.config");
const AppError = require("../Utils/AppError");

const verifyExistanceOfPassangerInWaitingStage = async (userUniqueId) => {
  // Query to check existence in the shipper table
  const shipperSql = `SELECT * FROM Users WHERE userUniqueId = ?`;
  const shipperValues = [userUniqueId];
  const [shipperResult] = await pool.query(shipperSql, shipperValues);

  if (shipperResult.length === 0) {
    throw new AppError("shipper not found", 404);
  }

  // Query to check existence in the ShipperRequest table
  const requestSql = `SELECT * FROM ShipperRequest WHERE userUniqueId = ? AND userJourneyStatusId IN ('1', '2', '3','4')`;
  const requestValues = [userUniqueId];
  const [requestResult] = await pool.query(requestSql, requestValues);

  // Combine the results (if necessary) or return the request results directly
  if (requestResult.length > 0) {
    return {
      status: "success",
      shipper: { ...requestResult[0], ...shipperResult[0] },
      data: "shipper is in waiting stage",
    };
  } else {
    return {
      status: "success",
      shipper: { ...shipperResult[0] },
      data: "shipper is not in waiting stage",
    };
  }
};

module.exports = { verifyExistanceOfPassangerInWaitingStage };
