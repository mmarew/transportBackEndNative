const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("./ListOfFixedData");
//
const VerifyIfPassengerRequestWasNotRejected = async ({
  passengerRequestId,
  driverUserUniqueId,
}) => {
  const sql = `Select * from JourneyDecisions join DriverRequest on JourneyDecisions.driverRequestId = DriverRequest.driverRequestId where JourneyDecisions.passengerRequestId = ? and DriverRequest.userUniqueId = ? and (JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ?)`;

  const [result] = await pool.query(sql, [
    passengerRequestId,
    driverUserUniqueId,
    journeyStatusMap.cancelledByDriver,
    journeyStatusMap.rejectedByPassenger,
  ]);
  if (result.length === 0) {
    return { message: "success", status: 1, data: result };
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
const VerifyIfDriverDidNotRejectPassengersRequest = async ({
  passengerRequestId,
  driverUserUniqueId,
}) => {
  const sql = `Select * from JourneyDecisions join PassengerRequest on JourneyDecisions.passengerRequestId = PassengerRequest.passengerRequestId where JourneyDecisions.driverRequestId = ? and PassengerRequest.userUniqueId = ? and (JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ?)`;

  const [result] = await pool.query(sql, [
    driverUserUniqueId,
    passengerRequestId,
    journeyStatusMap.cancelledByPassenger,
    journeyStatusMap.rejectedByDriver,
  ]);
  if (result.length === 0) {
    return { message: "success", status: 1 };
  } else {
    return {
      result,
      message: "error",
      status: 0,
      error:
        "Driver request was rejected by the passenger or cancelled by the passenger",
    };
  }
};
module.exports = {
  VerifyIfPassengerRequestWasNotRejected,
  VerifyIfDriverDidNotRejectPassengersRequest,
};
