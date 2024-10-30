const bcrypt = require("bcrypt");
const verifyPassword = async ({ hashedPassword, notHashedPassword }) => {
  //validate hashed password and not hashed password
  if (!hashedPassword) {
    return {
      message: "error",
      data: "Invalid password",
      error: "hashed Password is required",
    };
  }
  if (!notHashedPassword) {
    return {
      message: "error",
      data: "Invalid password",
      error: "password is required",
    };
  }
  const isMatch = await bcrypt.compare(notHashedPassword, hashedPassword);
  if (!isMatch) {
    return {
      message: "error",
      data: "Invalid password",
      error: "Invalid password",
    };
  }
  return { message: "success", data: isMatch };
};
module.exports = verifyPassword;
