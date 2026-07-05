const jwt = require("jsonwebtoken");
const Config = require("./Config");

// Function to create JWT
const createJWT = (userData) => {
  const secretKey = Config.SECRET_KEY;
  const { userUniqueId, phoneNumber, roleId } = userData;
  if (!userUniqueId || !phoneNumber || !roleId) {
    const AppError = require("./AppError");
    throw new AppError("All fields are required to create jwt", 400);
  }
  // Create the token
  const token = jwt.sign(
    {
      data: { userUniqueId, phoneNumber, roleId },
    },
    secretKey,
  );

  return { token, message: "success" };
};

module.exports = createJWT;
