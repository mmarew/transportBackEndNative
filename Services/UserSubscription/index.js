"use strict";

const createService = require("./create.service");
const readService = require("./read.service");
const updateService = require("./update.service");
const deleteService = require("./delete.service");
const helpersService = require("./helpers.service");

module.exports = {
  ...createService,
  ...readService,
  ...updateService,
  ...deleteService,
  ...helpersService
};
