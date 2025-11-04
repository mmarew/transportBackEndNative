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

    // ✅ Main query (filter by driver, date range, and completed journeys)
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
      WHERE 
        DriverRequest.userUniqueId = ?
        AND JourneyDecisions.decisionTime BETWEEN ? AND ?
        AND JourneyDecisions.journeyStatusId = ?
      ORDER BY JourneyDecisions.journeyDecisionId DESC
      LIMIT ? OFFSET ?
    `;

    const params = [
      driverUniqueId,
      fromDate,
      toDate,
      journeyStatusMap?.journeyCompleted, // only completed journeys
      Number(limit),
      Number(offset),
    ];

    const [data] = await pool.query(sql, params);

    // ✅ Get total count for pagination
    const countSql = `
      SELECT COUNT(*) AS total
      FROM JourneyDecisions
      JOIN DriverRequest 
        ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId
      WHERE 
        DriverRequest.userUniqueId = ?
        AND JourneyDecisions.decisionTime BETWEEN ? AND ?
        AND JourneyDecisions.journeyStatusId = ?
    `;

    const [countRows] = await pool.query(countSql, [
      driverUniqueId,
      fromDate,
      toDate,
      journeyStatusMap?.journeyCompleted,
    ]);

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
