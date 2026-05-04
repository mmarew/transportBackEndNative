const ServerResponder = require("../Utils/ServerResponder");
const AccountService = require("../Services/Account.service");
const { executeInTransaction } = require("../Utils/DatabaseTransaction");
const AppError = require("../Utils/AppError");

/**
 * GET /api/me/account  (and role-scoped variants)
 * ─────────────────────────────────────────────
 * Self account status — resolves user and role entirely from the JWT token.
 * No roleId or ownerUserUniqueId params are accepted or needed.
 * Admins can optionally pass ?roleId= to inspect a specific role,
 * but non-admins are always locked to their own token role.
 */
const selfAccountStatus = async (req, res, next) => {
  try {
    const user = req.user;
    // Allow override only for admins/superAdmins (e.g., inspecting a specific role)
    const { usersRoles } = require("../Utils/ListOfSeedData");
    const isAdmin =
      user.roleId === usersRoles.adminRoleId ||
      user.roleId === usersRoles.supperAdminRoleId;

    // Non-admins: role is always what's in the token — ignore any query params
    const resolvedRoleId = isAdmin
      ? (req.query.roleId ?? user.roleId)
      : user.roleId;

    const result = await executeInTransaction(async () =>
      AccountService.accountStatus({
        ownerUserUniqueId: user.userUniqueId,
        body: { roleId: resolvedRoleId },
        user,
        enableDocumentChecks: true,
      }),
    );
    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/account/status  (admin cross-user lookup — kept for backward compat)
 * Allows admin to look up any user by phoneNumber, email, or ownerUserUniqueId.
 * Should only be called by admin/superAdmin — middleware enforces this in routes.
 */
const accountStatus = async (req, res, next) => {
  try {
    // Extract validated parameters from middleware-updated req.query
    let user = req?.user;
    const userUniqueId = user?.userUniqueId;
    //extract data from req?.query
    const query = req?.query;
    let ownerUserUniqueId = query?.ownerUserUniqueId;
    const phoneNumber = query?.phoneNumber;
    const email = query?.email;
    let enableDocumentChecks = query?.enableDocumentChecks;

    // Priority: ownerUserUniqueId > phoneNumber > email > self
    if (!ownerUserUniqueId || ownerUserUniqueId === "self") {
      // if phone number or email is provided, then set ownerUserUniqueId to null and user to null
      if (phoneNumber || email) {
        // Will be resolved in service by phone/email
        ownerUserUniqueId = null;
        user = null;
      } else {
        ownerUserUniqueId = userUniqueId;
        // So service gets roleId from body (req.query); use token's role when query didn't send it
        if (query) {
          query.roleId = query.roleId ?? user?.roleId;
        }
      }
    } else {
      user = null;
    }

    const result = await executeInTransaction(async () => {
      return await AccountService?.accountStatus({
        ownerUserUniqueId,
        phoneNumber,
        email,
        user,
        body: query || {},
        enableDocumentChecks,
      });
    });

    ServerResponder(res, result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  accountStatus,
  selfAccountStatus,
};
