const bcrypt = require("bcryptjs");
const AppError = require("./AppError");

const verifyPassword = async ({ hashedPassword, notHashedPassword }) => {
  // validate hashed password and not hashed password
  if (!hashedPassword) {
    throw new AppError("hashed Password is required", AppError.BAD_REQUEST);
  }
  if (!notHashedPassword) {
    throw new AppError("password is required", AppError.BAD_REQUEST);
  }
  const isMatch = await bcrypt.compare(notHashedPassword, hashedPassword);
  if (!isMatch) {
    throw new AppError("Invalid password", AppError.UNAUTHORIZED);
  }
  return { message: "success", data: isMatch };
};
module.exports = verifyPassword;
