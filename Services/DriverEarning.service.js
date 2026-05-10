const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfSeedData");
const AppError = require("../Utils/AppError");
const { transactionStorage } = require("../Utils/TransactionContext");

exports.getDriverEarningsByFilter = async ({
  driverUniqueId,
  fromDate,
  toDate,
  offset = 0,
  limit = 10,
}) => {
  // ✅ Basic validation
  if (!driverUniqueId) {
    throw new AppError("Missing required parameters: driverUniqueId", 400);
  }

  // Build WHERE conditions dynamically
  let whereConditions = [
    "DriverRequest.userUniqueId = ?",
    "JourneyDecisions.journeyStatusId = ?",
  ];

  let params = [
    driverUniqueId,
    journeyStatusMap?.journeyCompleted, // only completed journeys
  ];

  // Add date filter only if both dates are provided
  if (fromDate && toDate) {
    whereConditions.push("JourneyDecisions.decisionTime BETWEEN ? AND ?");
    params.push(fromDate, toDate);
  } else if (fromDate) {
    // If only fromDate is provided, filter from that date onwards
    whereConditions.push("JourneyDecisions.decisionTime >= ?");
    params.push(fromDate);
  } else if (toDate) {
    // If only toDate is provided, filter up to that date
    whereConditions.push("JourneyDecisions.decisionTime <= ?");
    params.push(toDate);
  }

  // Add pagination parameters
  params.push(Number(limit), Number(offset));

  // ✅ Main query (filter by driver, date range if provided, and completed journeys)
  const sql = `
      SELECT 
        JourneyDecisions.*, 
        DriverRequest.*, 
        PassengerRequest.* 
      FROM JourneyDecisions
      JOIN DriverRequest 
        ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      JOIN PassengerRequest 
        ON PassengerRequest.shipperRequestId = JourneyDecisions.shipperRequestId
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY JourneyDecisions.journeyDecisionId DESC
      LIMIT ? OFFSET ?
    `;

  const executor = transactionStorage.getStore() || pool;
  const [data] = await executor.query(sql, params);

  // ✅ Get total count for pagination (remove limit/offset from params)
  const countParams = params.slice(0, -2); // Remove limit and offset

  const countSql = `
      SELECT COUNT(*) AS total
      FROM JourneyDecisions
      JOIN DriverRequest 
        ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${whereConditions.join(" AND ")}
    `;

  const [countRows] = await executor.query(countSql, countParams);

  const total = countRows[0]?.total || 0;

  return {
    message: "success",
    pagination: {
      total,
      limit: Number(limit),
      offset: Number(offset),
      totalPages: Math.ceil(total / limit),
      hasNext: offset + limit < total,
      hasPrev: offset > 0,
    },
    data,
  };
};
