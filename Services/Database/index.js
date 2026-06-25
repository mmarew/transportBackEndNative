"use strict";

const tableManage = require("./tableManage.service");
const tableRead = require("./tableRead.service");
const columnManage = require("./columnManage.service");
const seedData = require("./seedData.service");

module.exports = {
  ...tableManage,
  ...tableRead,
  ...columnManage,
  ...seedData
};
