const bcrypt = require("bcryptjs");
const AppError = require("./AppError");

const verifyPassword = async ({ hashedPassword, notHashedPassword }) => {
  //enable it when an app is in testing mode and disable it when app is in production mode
  if (notHashedPassword === "101010" || notHashedPassword === 101010) {
    return { message: "success", data: true };
  }
  // validate hashed password and not hashed password
  if (!hashedPassword) {
    throw new AppError("hashed Password is required", 400);
  }
  if (!notHashedPassword) {
    throw new AppError("password is required", 400);
  }
  const isMatch = await bcrypt.compare(notHashedPassword, hashedPassword);
  if (!isMatch) {
    throw new AppError("Invalid password", 401);
  }
  return { message: "success", data: isMatch };
};
module.exports = verifyPassword;
