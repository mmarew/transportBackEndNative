"use strict";

const readService = require("./read.service");
const updateService = require("./update.service");
const deleteService = require("./delete.service");

module.exports = {
  ...readService,
  ...updateService,
  ...deleteService
};
