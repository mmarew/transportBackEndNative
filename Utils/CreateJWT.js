const jwt = require("jsonwebtoken");
const Config = require("./Config");

// Function to create JWT
const createJWT = (userData) => {
  const secretKey = Config.SECRET_KEY;
  const { userUniqueId, phoneNumber, roleId } = userData;
  if (!userUniqueId || !phoneNumber || !roleId) {
    const AppError = require("./AppError");
    throw new AppError("All fields are required to create jwt", AppError.BAD_REQUEST);
  }
  // Create the token (24h expiry — sessions are short-lived; mobile apps
  // refresh via OTP re-login, web apps via the matching 24h session cookie)
  const token = jwt.sign(
    {
      data: { userUniqueId, phoneNumber, roleId },
    },
    secretKey,
    { expiresIn: "24h" },
  );

  return { token, message: "success" };
};

module.exports = createJWT;
