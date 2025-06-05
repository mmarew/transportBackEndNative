const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("../Utils/ListOfFixedData");

exports.getDriverEarningByDriverUniqueId = async ({
  driverUniqueId,
  fromDate,
  toDate,
}) => {
  const sql = `
     select * from JourneyDecisions join DriverRequest on DriverRequest.driverRequestId=JourneyDecisions.driverRequestId where userUniqueId = ? and decisionTime between ? and ? and JourneyDecisions.journeyStatusId=?`;

  if (fromDate == "lastTen" || toDate == "lasTen") {
    const sql = `
     select * from JourneyDecisions join DriverRequest on DriverRequest.driverRequestId=JourneyDecisions.driverRequestId where userUniqueId = ? order by JourneyDecisions?.journeyDecisionId desc limit 10`;
    const params = [driverUniqueId];
    const [data] = await pool.query(sql, params);
    return { message: "success", data: data };
  }
  const params = [
    driverUniqueId,
    fromDate,
    toDate,
    journeyStatusMap?.journeyCompleted,
  ];
  const [data] = await pool.query(sql, params);
  return { message: "success", data: data };
};
