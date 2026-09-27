const jwt = require("jsonwebtoken");
const Config = require("./Config");
const { getSessionTtlSeconds } = require("./SessionPolicy");

// Function to create JWT
const createJWT = (userData) => {
  const secretKey = Config.SECRET_KEY;
  const { userUniqueId, phoneNumber, roleId } = userData;
  if (!userUniqueId || !phoneNumber || !roleId) {
    const AppError = require("./AppError");
    throw new AppError("All fields are required to create jwt", AppError.BAD_REQUEST);
  }
  // Role-based session lifetime: system admins (roles 3 & 6) get a short TTL
  // (SESSION_TTL_ADMINS, default 24h); everyone else gets a long TTL
  // (SESSION_TTL_OTHERS, default 365d) so drivers/shippers/company & queue
  // admins don't have to re-login constantly. Mobile apps keep the token in the
  // response body; web apps get a matching session cookie.
  const token = jwt.sign(
    {
      data: { userUniqueId, phoneNumber, roleId },
    },
    secretKey,
    { expiresIn: getSessionTtlSeconds(roleId) },
  );

  return { token, message: "success" };
};

module.exports = createJWT;
