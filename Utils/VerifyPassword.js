const bcrypt = require("bcrypt");
const verifyPassword = async ({ hashedPassword, notHashedPassword }) => {
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
