const jwt = require("jsonwebtoken");
const { getData } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const { usersRoles } = require("../Utils/ListOfSeedData");
const Config = require("../Utils/Config");
const secretKey = Config.SECRET_KEY;

const verifyTokenOfAxios = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;

  if (!authHeader) {
    return next(new AppError("Authorization header missing", 401));
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, secretKey);
    const data = decoded?.data;
    const userUniqueId = data?.userUniqueId;

    const user = await getData({
      tableName: "Users",
      conditions: { userUniqueId },
    });

    if (user.length === 0) {
      return next(new AppError("User not found in the token", 401));
    }

    const userRow = user[0];
    if (userRow.isDeleted || userRow.userDeletedAt) {
      return next(
        new AppError(
          "Account has been deleted and can no longer access the service",
          403,
        ),
      );
    }

    req.user = { ...userRow, ...data };
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }

    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token", 401));
    }
    if (error.name === "NotBeforeError") {
      return next(new AppError("Token not active", 401));
    }

    if (error.code === "ETIMEDOUT") {
      return next(
        new AppError("Connection timeout. Please try again later.", 503),
      );
    }

    next(new AppError(error.message || "Token verification failed", 401));
  }
};

const verifyTokenOfWS = async (tokenData) => {
  const token = tokenData.split(" ")[1]; // Extract token from "Bearer <token>"
  try {
    const decoded = jwt.verify(token, secretKey);
    decoded.valid = true;
    return decoded;
  } catch (error) {
    let errorMessage = "Token verification failed";
    if (error.name === "TokenExpiredError") {
      errorMessage = "Token expired";
    }
    if (error.name === "JsonWebTokenError") {
      errorMessage = "Invalid token";
    }
    if (error.name === "NotBeforeError") {
      errorMessage = "Token not active";
    }

    return {
      valid: false,
      status: "error",
      error: errorMessage,
    };
  }
};

const verifyIfUserIsSupperAdmin = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (!authHeader) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, secretKey);
    const data = decoded?.data;
    const roleId = data?.roleId;
    if (roleId !== usersRoles.supperAdminRoleId) {
      return next(new AppError("You are not allowed to do this action", 401));
    }
    next();
  } catch {
    next(
      new AppError(
        "Sorry, unexpected error happened, you are not allowed to do this action",
        401,
      ),
    );
  }
};

const verifyIfUserIsAdminOrSupperAdmin = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (!authHeader) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, secretKey);
    const data = decoded?.data;
    const roleId = data?.roleId;
    if (
      roleId !== usersRoles.adminRoleId &&
      roleId !== usersRoles.supperAdminRoleId
    ) {
      return next(new AppError("You are not allowed to do this action", 401));
    }
    next();
  } catch {
    next(
      new AppError(
        "Sorry, unexpected error happened, you are not allowed to do this action",
        401,
      ),
    );
  }
};

const verifyIfUserIsAdminSuperAdminOrCompanyAdmin = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  if (!authHeader) {
    return next();
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, secretKey);
    const data = decoded?.data;
    const roleId = data?.roleId;
    if (
      roleId !== usersRoles.adminRoleId &&
      roleId !== usersRoles.supperAdminRoleId &&
      roleId !== usersRoles.companyAdminRoleId
    ) {
      return next(new AppError("You are not allowed to do this action", 401));
    }
    next();
  } catch {
    next(
      new AppError(
        "Sorry, unexpected error happened, you are not allowed to do this action",
        401,
      ),
    );
  }
};

module.exports = {
  verifyTokenOfAxios,
  verifyTokenOfWS,
  verifyIfUserIsSupperAdmin,
  verifyIfUserIsAdminOrSupperAdmin,
  verifyIfUserIsAdminSuperAdminOrCompanyAdmin,
};
