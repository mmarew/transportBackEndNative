"use strict";

const userManage = require("./userManage.controller");
const userRead = require("./userRead.controller");

module.exports = {
  ...userManage,
  ...userRead
};
