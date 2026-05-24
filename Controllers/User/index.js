"use strict";

const userAuth = require("./userAuth.controller");
const userManage = require("./userManage.controller");
const userRead = require("./userRead.controller");

module.exports = {
  ...userAuth,
  ...userManage,
  ...userRead
};
