"use strict";

module.exports = {
  ...require("./start.service"),
  ...require("./complete.service"),
  ...require("./location.service"),
  ...require("./loading.service"),
};