const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");

exports.getDriverEarningByDriverUniqueId = async ({
  driverUniqueId,
  fromDate,
  toDate,
  offset,
}) => {
  // Debug input
  console.log("Input offset:", offset, "Type:", typeof offset);

  if (fromDate == "lastTen" || toDate == "lasTen") {
    console.log("Fetching last 10 records");
    const sql = `
      SELECT * FROM JourneyDecisions 
      JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId 
      JOIN PassengerRequest ON PassengerRequest.passengerRequestId = JourneyDecisions.passengerRequestId 
      WHERE DriverRequest.userUniqueId = ? 
      ORDER BY JourneyDecisions.journeyDecisionId DESC 
      LIMIT 10`;
    const params = [driverUniqueId];
    const [data] = await pool.query(sql, params);
    return { message: "success", data: data };
  }

  // Main query with explicit LIMIT and OFFSET
  const sql = `
    SELECT * FROM JourneyDecisions 
    JOIN DriverRequest ON DriverRequest.driverRequestId = JourneyDecisions.driverRequestId 
    WHERE userUniqueId = ? 
      AND decisionTime BETWEEN ? AND ? 
      AND JourneyDecisions.journeyStatusId = ? 
    ORDER BY journeyDecisionId 
    LIMIT ? OFFSET ?`;

  const params = [
    driverUniqueId,
    fromDate,
    toDate,
    journeyStatusMap?.journeyCompleted,
    30, // LIMIT
    Number(offset), // OFFSET (must be number)
  ];

  console.log("Executing query:", sql);
  console.log("With params:", params);

  const [data] = await pool.query(sql, params);
  return { message: "success", data: data, length: data?.length };
};
