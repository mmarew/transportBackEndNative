const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");

exports.getDriverEarningsByFilter = async ({
  driverUniqueId,
  fromDate,
  toDate,
  offset = 0,
  limit = 30,
}) => {
  try {
    // ✅ Basic validation
    if (!driverUniqueId) {
      return { message: "error", error: "Missing required parameters" };
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
        ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY JourneyDecisions.journeyDecisionId DESC
      LIMIT ? OFFSET ?
    `;

    const [data] = await pool.query(sql, params);

    // ✅ Get total count for pagination (remove limit/offset from params)
    const countParams = params.slice(0, -2); // Remove limit and offset

    const countSql = `
      SELECT COUNT(*) AS total
      FROM JourneyDecisions
      JOIN DriverRequest 
        ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE ${whereConditions.join(" AND ")}
    `;

    const [countRows] = await pool.query(countSql, countParams);

    const total = countRows[0]?.total || 0;

    return {
      message: "success",
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        totalPages: Math.ceil(total / limit),
      },
      data,
    };
  } catch (error) {
    console.error("Error in getDriverEarningsByFilter:", error);
    return { message: "error", error: error.message };
  }
};
