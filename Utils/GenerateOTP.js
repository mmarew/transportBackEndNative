const generateOTP = () => {
  const Config = require("./Config");
  // DEV MODE: always use the fixed test OTP (default: 101010) so testers can
  // sign in even in production.  Override via TEST_OTP env var or Config.TEST.OTP.
  return String(Config.TEST.OTP || "101010");
};

module.exports = generateOTP;
