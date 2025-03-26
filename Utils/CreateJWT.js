const jwt = require("jsonwebtoken");
require("dotenv").config();

// Function to create JWT
const createJWT = (userData) => {
  const secretKey = process.env.SECRET_KEY;
  const { userUniqueId, fullName, phoneNumber, email, roleId } = userData;
  console.log("@createJWT userData ==========> ", userData);
  if (!userUniqueId || !phoneNumber || !roleId) {
    return {
      message: "error",
      error: "All fields are required to create jwt",
    };
  }
  // Create the token
  const token = jwt.sign(
    {
      data: { ...userData },
    },
    secretKey
  );

  return { token, message: "success" };
};

module.exports = createJWT;
