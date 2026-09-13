"use strict";

module.exports = {
  ...require("./credentials.service"),
  ...require("./register.service"),
  ...require("./admin.service"),
  ...require("./queue-admin.service"),
  ...require("./system.service"),
};
