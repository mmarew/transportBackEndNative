const crypto = require("crypto");

const generateOTP = () => {
  const Config = require("./Config");
  // In non-production, use a fixed OTP for E2E testing (default: 101010).
  // Override via TEST_OTP env var or Config.TEST.OTP.
  // In production, still uses test OTP if Config.USE_TEST_OTP is true.
  if (Config.NODE_ENV !== "production" || Config.USE_TEST_OTP) {
    return String(Config.TEST.OTP || "101010");
  }
  return crypto.randomInt(100000, 999999).toString();
};

module.exports = generateOTP;
