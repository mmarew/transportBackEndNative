"use strict";

const activeDrivers = require("./activeDrivers.service");
const offlineDrivers = require("./offlineDrivers.service");
const onlineDrivers = require("./onlineDrivers.service");
const unauthorizedDrivers = require("./unauthorizedDrivers.service");

module.exports = {
  ...activeDrivers,
  ...offlineDrivers,
  ...onlineDrivers,
  ...unauthorizedDrivers
};
