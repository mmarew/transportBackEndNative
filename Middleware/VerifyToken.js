const jwt = require("jsonwebtoken");
const { getData } = require("../CRUD/Read/ReadData");
const AppError = require("../Utils/AppError");
const { usersRoles } = require("../Utils/ListOfSeedData");
const { pool } = require("./Database.config");
const Config = require("../Utils/Config");
const secretKey = Config.SECRET_KEY;

/** Extracts a JWT from Authorization: Bearer <tok> or the session cookie. */
const extractToken = (req) => {
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }
  if (req?.cookies?.token) {
    return req.cookies.token;
  }
  return undefined;
};

/** Normalizes a WS token: accepts "Bearer <tok>" or a raw JWT. */
const extractWsToken = (tokenData) => {
  if (!tokenData) return null;
  const normalized = String(tokenData).trim();
  if (normalized.startsWith("Bearer ")) {
    return normalized.split(" ")[1];
  }
  return normalized;
};

const verifyTokenOfAxios = async (req, res, next) => {
  const token = extractToken(req);
  console.log('[VerifyToken] Request:', { method: req.method, url: req.url, hasAuth: !!token });

  if (!token) {
    console.log('[VerifyToken] No auth token');
    return next(new AppError("Authorization header missing", AppError.UNAUTHORIZED));
  }
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
          AppError.FORBIDDEN,
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
  const token = extractWsToken(tokenData);
  if (!token) {
    return { valid: false, status: "error", error: "Token missing" };
  }
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
  const token = extractToken(req);
  if (!token) {
    return next();
  }

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
        AppError.UNAUTHORIZED,
      ),
    );
  }
};

const verifyIfUserIsAdminOrSupperAdmin = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

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
        AppError.UNAUTHORIZED,
      ),
    );
  }
};

const verifyIfUserIsAdminSuperAdminOrCompanyAdmin = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

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
        AppError.UNAUTHORIZED,
      ),
    );
  }
};

/**
 * Middleware: verify the caller has queue organization admin privileges.
 *
 * Checks the JWT's `roleId` against the allowed roles:
 * - `queueOrgAdmin` (role 11)
 * - `admin` (role 3)
 * - `superAdmin` (role 6)
 *
 * If no Authorization header is present, calls `next()` without error (allows
 * unauthenticated requests to pass through for optional auth patterns). If the
 * token is present but the role is not allowed, returns 401.
 *
 * @param {import('express').Request} req - Express request.
 * @param {import('express').Response} res - Express response.
 * @param {import('express').NextFunction} next - Express next.
 */
const verifyIfUserIsQueueOrgAdmin = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

  try {
    const decoded = jwt.verify(token, secretKey);
    const data = decoded?.data;
    const roleId = data?.roleId;
    if (
      roleId !== usersRoles.queueOrgAdminRoleId &&
      roleId !== usersRoles.queueDispatcherRoleId &&
      roleId !== usersRoles.adminRoleId &&
      roleId !== usersRoles.supperAdminRoleId
    ) {
      return next(new AppError("You are not allowed to do this action", AppError.UNAUTHORIZED));
    }

    // Suspension enforcement: platform admins (3/6) are always allowed; org
    // staff (11/12) must hold an ACTIVE membership in the queue organization
    // targeted by this request. A deactivated membership (isActive = 0) thus
    // revokes queue power until reactivated.
    if (roleId === usersRoles.adminRoleId || roleId === usersRoles.supperAdminRoleId) {
      return next();
    }

    let queueOrganizationUniqueId =
      req?.params?.queueOrganizationUniqueId ||
      req?.body?.queueOrganizationUniqueId ||
      req?.query?.queueOrganizationUniqueId;
    if (!queueOrganizationUniqueId && req?.params?.queueUniqueId) {
      const [entry] = await pool.query(
        "SELECT queueOrganizationUniqueId FROM DriverQueue WHERE queueUniqueId = ?",
        [req.params.queueUniqueId],
      );
      queueOrganizationUniqueId = entry?.[0]?.queueOrganizationUniqueId;
    }
    if (!queueOrganizationUniqueId) {
      return next();
    }

    const [active] = await pool.query(
      `SELECT 1 FROM QueueOrganizationMembership
       WHERE queueOrganizationUniqueId = ?
         AND userUniqueId = ?
         AND roleId IN (?, ?)
         AND isActive = 1
         AND membershipDeletedAt IS NULL
       LIMIT 1`,
      [
        queueOrganizationUniqueId,
        data?.userUniqueId,
        usersRoles.queueOrgAdminRoleId,
        usersRoles.queueDispatcherRoleId,
      ],
    );
    if (active.length === 0) {
      return next(
        new AppError(
          "Your access to this queue organization has been suspended or you are not an active staff member",
          AppError.FORBIDDEN,
        ),
      );
    }
    next();
  } catch {
    next(
      new AppError(
        "Sorry, unexpected error happened, you are not allowed to do this action",
        AppError.UNAUTHORIZED,
      ),
    );
  }
};

const verifyIfUserIsAdminSuperAdminCompanyAdminOrQueueOrgAdmin = async (
  req,
  res,
  next,
) => {
  const token = extractToken(req);
  if (!token) {
    return next();
  }

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
        AppError.UNAUTHORIZED,
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
  extractWsToken,
};
