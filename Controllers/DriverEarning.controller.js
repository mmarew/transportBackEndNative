const Services = require("../Services/DriverEarning.service");
const ServerResponder = require("../Utils/ServerResponder");

exports.getDriverEarningsByFilter = async (req, res) => {
  try {
    const user = req.user;
    let driverUniqueId = req.query.driverUniqueId;
    driverUniqueId(driverUniqueId == "self")
      ? user.userUniqueId
      : driverUniqueId;
    const result = await Services.getDriverEarningsByFilter({
      ...req?.query,
      driverUniqueId,
    });
    console.log("@result", result);
    ServerResponder(res, result);
  } catch (error) {
    ServerResponder(res, {
      message: "error",
      error: "",
    });
  }
};
