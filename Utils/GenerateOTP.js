const crypto = require("crypto");

const generateOTP = () => {
  const Config = require("./Config");
  // Security: a fixed test OTP (e.g. 101010) is ONLY acceptable when the build
  // explicitly opted in (TEST_OTP_ENABLED is true in non-production, or an
  // explicit USE_TEST_OTP=true override). Production MUST issue a cryptogra-
  // phically random 6-digit code so the OTP can never be guessed from a static
  // default embedded in source.
  if (Config.TEST_OTP_ENABLED) {
    return String(Config.TEST.OTP || "101010");
  }
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
};

module.exports = generateOTP;