const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("./ListOfFixedData");
//
const VerifyIfPassengerRequestWasNotRejected = async ({
  passengerRequestId,
  userUniqueId,
}) => {
  const sql = `Select * from JourneyDecisions join DriverRequest on JourneyDecisions.driverRequestId = DriverRequest.driverRequestId where JourneyDecisions.passengerRequestId = ? and DriverRequest.userUniqueId = ? and (JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ?)`;

  const [result] = await pool.query(sql, [
    passengerRequestId,
    userUniqueId,
    journeyStatusMap.cancelledByDriver,
    journeyStatusMap.rejectedByPassenger,
  ]);
  if (result.length === 0) {
    return { message: "success", status: 1 };
  } else {
    return {
      result,
      message: "error",
      status: 0,
      error:
        "Passenger request was rejected by the driver or cancelled by the driver",
    };
  }
};
module.exports = VerifyIfPassengerRequestWasNotRejected;
