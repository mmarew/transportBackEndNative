const { pool } = require("../Middleware/Database.config");
const { journeyStatusMap } = require("./ListOfSeedData");
//exclude previously rejected shipper requests by driver (rejectedByDriver), cancelled by driver (cancelledByDriver), cancelled by admin (cancelledByAdmin), rejected by shipper (rejectedByShipper), or by system
const VerifyIfShipperRequestWasNotRejected = async ({
  shipperRequestId,
  driverUserUniqueId,
}) => {
  const sql = `Select * from JourneyDecisions join DriverRequest on JourneyDecisions.driverRequestId = DriverRequest.driverRequestId where JourneyDecisions.shipperRequestId = ? and DriverRequest.userUniqueId = ? and (JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ?)`;

  const [result] = await pool.query(sql, [
    shipperRequestId,
    driverUserUniqueId,
    journeyStatusMap.cancelledByDriver,
    journeyStatusMap.rejectedByShipper,
    journeyStatusMap.rejectedByDriver,
    journeyStatusMap.cancelledByAdmin,
  ]);
  if (result.length === 0) {
    return { message: "success", status: 1, data: result };
  } else {
    return {
      message: "error",
      error:
        "Shipper request was rejected by the driver, cancelled by the driver, or cancelled by admin",
    };
  }
};
const VerifyIfDriverDidNotRejectShippersRequest = async ({
  shipperRequestId,
  driverUserUniqueId,
}) => {
  const sql = `Select * from JourneyDecisions join ShipperRequest on JourneyDecisions.shipperRequestId = ShipperRequest.shipperRequestId where JourneyDecisions.driverRequestId = ? and ShipperRequest.userUniqueId = ? and (JourneyDecisions.journeyStatusId = ? or JourneyDecisions.journeyStatusId = ?)`;

  const [result] = await pool.query(sql, [
    driverUserUniqueId,
    shipperRequestId,
    journeyStatusMap.cancelledByShipper,
    journeyStatusMap.rejectedByDriver,
  ]);
  if (result.length === 0) {
    return { message: "success", status: 1 };
  } else {
    return {
      message: "error",
      error:
        "Driver request was rejected by the shipper or cancelled by the shipper",
    };
  }
};
module.exports = {
  VerifyIfShipperRequestWasNotRejected,
  VerifyIfDriverDidNotRejectShippersRequest,
};
