"use strict";

const loginService = require("./login.service");
const otpService = require("./otp.service");
const emailVerificationService = require("./emailVerification.service");
const phoneVerificationService = require("./phoneVerification.service");

module.exports = {
  ...loginService,
  ...otpService,
  ...emailVerificationService,
  ...phoneVerificationService
};
