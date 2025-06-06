const Services = require("../Services/DriverEarning.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.getDriverEarningByDriverUniqueId = async (req, res) => {
  try {
    let driverUniqueId = req.params.driverUniqueId;
    const user = req.user;
    console.log(
      "@getDriverEarningByDriverUniqueId controller driverUniqueId",
      driverUniqueId,
      "\nuser",
      user
    );
    // return;
    if (driverUniqueId == "self") {
      driverUniqueId = user.userUniqueId;
    }
    const { fromDate, toDate } = req.params;
    const result = await Services.getDriverEarningByDriverUniqueId({
      driverUniqueId,
      fromDate,
      toDate,
    });
    const responders = await ServerResponder(res, result);
  } catch (error) {
    console.log("@getDriverEarningByDriverUniqueId error", error);
    ServerResponder(res, { message: "error", error: "something went wrong" });
  }
};
