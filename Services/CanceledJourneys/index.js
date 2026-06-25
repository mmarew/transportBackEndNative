"use strict";

const cancelCreate = require("./cancelCreate.service");
const cancelRead = require("./cancelRead.service");
const cancelUpdate = require("./cancelUpdate.service");
const cancelDelete = require("./cancelDelete.service");
const cancelStats = require("./cancelStats.service");

module.exports = {
  ...cancelCreate,
  ...cancelRead,
  ...cancelUpdate,
  ...cancelDelete,
  ...cancelStats
};
