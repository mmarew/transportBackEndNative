const bcrypt = require("bcryptjs");
const { pool } = require("../Middleware/Database.config");
const verifyPassword = require("./VerifyPassword");
const { getData } = require("../CRUD/Read/ReadData");

const verifySMSSenderReality = async (phoneNumber, password) => {
  const result = await getData({
    tableName: "SMSSender",
    conditions: { phoneNumber },
  });
  if (result.length === 0) {
    return { message: "error", error: "This phone number is not found" };
  }
  const smssender = result[0];

  // Verify the password
  const { message, data } = await verifyPassword({
    hashedPassword: smssender.password,
    notHashedPassword: password,
  });

  if (message === "error") {
    return { message: "error", error: data };
  }

  return { message, data };
};

module.exports = verifySMSSenderReality;
