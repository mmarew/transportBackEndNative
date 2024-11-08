const jwt = require("jsonwebtoken");
require("dotenv").config();

// Function to create JWT
const createJWT = (userData) => {
  const secretKey = process.env.SECRET_KEY;
  const { userUniqueId, fullName, phoneNumber, email, roleId } = userData;
  if (!userUniqueId || !fullName || !phoneNumber || !email || !roleId) {
    return {
      message: "error",
      error: "All fields are required",
    };
  }
  // Create the token
  const token = jwt.sign(
    {
      // 11337.4
      data: { ...userData },
    },
    secretKey
  );

  return { token, message: "success" };
};

module.exports = createJWT;
