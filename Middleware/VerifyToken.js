const jwt = require("jsonwebtoken");
const { getData } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const { usersRoles } = require("../Utils/ListOfSeedData");
const Config = require("../Utils/Config");
const secretKey = Config.SECRET_KEY;

const verifyTokenOfAxios = async (req, res, next) => {
  const authHeader = req?.headers?.authorization;
  console.log('[VerifyToken] Request:', { method: req.method, url: req.url, hasAuth: !!authHeader });

  if (!authHeader) {
    console.log('[VerifyToken] No auth header');
    return next(new AppError("Authorization header missing", AppError.UNAUTHORIZED));
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, secretKey);
    const data = decoded?.data;
    const userUniqueId = data?.userUniqueId;
    console.log('[VerifyToken] Token decoded:', { userUniqueId, phoneNumber: data?.phoneNumber, roleId: data?.roleId, iat: decoded?.iat });

    const user = await getData({
      tableName: "Users",
      conditions: { userUniqueId },
    });

    if (user.length === 0) {
      console.log('[VerifyToken] User not found in DB:', userUniqueId);
      return next(new AppError("Invalid token", AppError.UNAUTHORIZED));
    }

    const userRow = user[0];
    if (userRow.isDeleted || userRow.userDeletedAt) {
      console.log('[VerifyToken] User deleted:', userUniqueId);
      return next(
        new AppError(
          "Account has been deleted and can no longer access the service",
          403,
        ),
      );
    }

    req.user = { ...userRow, ...data };
    console.log('[VerifyToken] User authenticated:', { userUniqueId, phoneNumber: userRow.phoneNumber, roleId: userRow.roleId });
    next();
  } catch (error) {
    console.error('[VerifyToken] Error:', error.name, error.message);
    if (error instanceof AppError) {
      return next(error);
    }

    if (error.name === "JsonWebTokenError") {
      return next(new AppError("Invalid token", AppError.UNAUTHORIZED));
    }
    if (error.name === "NotBeforeError") {
      return next(new AppError("Token not active", AppError.UNAUTHORIZED));
    }

    if (error.code === "ETIMEDOUT") {
      return next(
        new AppError("Connection timeout. Please try again later.", AppError.SERVICE_UNAVAILABLE),
      );
    }

    next(new AppError(error.message || "Token verification failed", AppError.UNAUTHORIZED));
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
      return next(new AppError("You are not allowed to do this action", AppError.UNAUTHORIZED));
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
      return next(new AppError("You are not allowed to do this action", AppError.UNAUTHORIZED));
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
      return next(new AppError("You are not allowed to do this action", AppError.UNAUTHORIZED));
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

const verifyIfUserIsQueueOrgAdmin = async (req, res, next) => {
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
      roleId !== usersRoles.queueOrgAdminRoleId &&
      roleId !== usersRoles.adminRoleId &&
      roleId !== usersRoles.supperAdminRoleId
    ) {
      return next(new AppError("You are not allowed to do this action", AppError.UNAUTHORIZED));
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

const verifyIfUserIsAdminSuperAdminCompanyAdminOrQueueOrgAdmin = async (
  req,
  res,
  next,
) => {
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
      roleId !== usersRoles.companyAdminRoleId &&
      roleId !== usersRoles.queueOrgAdminRoleId
    ) {
      return next(new AppError("You are not allowed to do this action", AppError.UNAUTHORIZED));
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
  verifyIfUserIsQueueOrgAdmin,
  verifyIfUserIsAdminSuperAdminCompanyAdminOrQueueOrgAdmin,
};
