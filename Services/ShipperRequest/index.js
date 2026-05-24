"use strict";

const createService = require("./create.service");
const readService = require("./read.service");
const readActiveService = require("./readActive.service");
const updateService = require("./update.service");
const deleteService = require("./delete.service");
const actionAccept = require("./actionAccept.service");
const actionReject = require("./actionReject.service");
const actionCancel = require("./actionCancel.service");
const statusVerification = require("./statusVerification.service");
const cancellation = require("./cancellation.service");

module.exports = {
  ...createService,
  ...readService,
  ...readActiveService,
  ...updateService,
  ...deleteService,
  ...actionAccept,
  ...actionReject,
  ...actionCancel,
  ...statusVerification,
  ...cancellation
};
