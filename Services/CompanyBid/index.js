"use strict";

const bidCreate = require("./bidCreate.service");
const bidRead = require("./bidRead.service");
const bidUpdate = require("./bidUpdate.service");
const bidDelete = require("./bidDelete.service");

module.exports = {
  ...bidCreate,
  ...bidRead,
  ...bidUpdate,
  ...bidDelete};
