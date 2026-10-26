"use strict";

module.exports = {
  ...require("./decision.service"),
  ...require("./driver-request.service"),
  ...require("./fleet.service"),
  ...require("./driverOnDuty.service"),
  ...require("./notify.service"),
  ...require("./read.service"),
  ...require("./recall.service"),
};
