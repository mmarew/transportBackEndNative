const jwt = require("jsonwebtoken");
require("dotenv").config();

// Function to create JWT
const createJWT = (userData) => {
  const secretKey = process.env.SECRET_KEY;
  // Create the token
  const token = jwt.sign(
    {
      data: { ...userData },
    },
    secretKey
  );

  return token;
};

module.exports = createJWT;
