const verifyPassword = require("./VerifyPassword");
const { getData } = require("../CRUD/Read/ReadData");

const verifySMSSenderReality = async (phoneNumber, password) => {
  const result = await getData({
    tableName: "SMSSender",
    conditions: { phoneNumber },
  });
  if (result.length === 0) {
    const AppError = require("./AppError");
    throw new AppError("This phone number is not found", AppError.NOT_FOUND);
  }
  const smssender = result[0];

  // Verify the password
  const { message, data } = await verifyPassword({
    hashedPassword: smssender.password,
    notHashedPassword: password,
  });

  if (message === "error") {
    const AppError = require("./AppError");
    throw new AppError(data, AppError.UNAUTHORIZED);
  }

  return { message, data };
};

module.exports = verifySMSSenderReality;
