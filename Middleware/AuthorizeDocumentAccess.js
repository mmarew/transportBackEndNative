/**
 * AuthorizeDocumentAccess.js
 *
 * Middleware factory that enforces who can read/write/delete attached documents.
 *
 * Rules:
 *  - Admin (3) / SuperAdmin (6)  → full access to everything
 *  - User (any role)             → only their own user documents (ownerType='user')
 *  - CompanyAdmin (7) / Dispatcher (10)
 *                                → their own user docs AND company docs for
 *                                  companies they are an active member of
 *  - Driver (2)                  → their own user docs AND vehicle docs for
 *                                  vehicles they are actively assigned to
 *                                  CANNOT access company docs
 *
 * Usage in routes:
 *   const { authorizeDocumentAccess } = require('../Middleware/AuthorizeDocumentAccess');
 *   router.get('/api/company/attachedDocuments/:companyUniqueId',
 *     verifyTokenOfAxios,
 *     (req, _res, next) => { req.ownerType = 'company'; req.ownerUniqueIdParam = req.params.companyUniqueId; next(); },
 *     authorizeDocumentAccess(),
 *     controller.getAttachedDocumentsByFilter,
 *   );
 */

const { pool } = require("./Database.config");
const AppError = require("../Utils/AppError");
const { usersRolesList, companyRoles } = require("../Utils/ListOfSeedData");

/**
 * Returns an Express middleware that checks if the requesting user is allowed
 * to access the resolved owner context.
 */
const authorizeDocumentAccess = () => {
  return async (req, _res, next) => {
    try {
      const currentUser = req.user;
      const roleId = currentUser?.roleId;

      // ── 1. Admins & Super Admins bypass all checks ───────────────────────────
      if (
        roleId === usersRolesList.admin.roleId ||
        roleId === usersRolesList.supperAdmin.roleId
      ) {
        return next();
      }

      // ── 2. Resolve the target owner from the request ─────────────────────────
      // ownerType is injected by the route inline middleware before this runs.
      const ownerType = req.ownerType ?? "user";

      // For user routes: the target id is from params or query; 'self' means current user.
      // For company/vehicle routes: ownerUniqueIdParam is set by the route inline middleware.
      let targetUniqueId =
        req.ownerUniqueIdParam ??
        req.params?.userUniqueId ??
        req.query?.userUniqueId;

      if (!targetUniqueId || targetUniqueId === "self") {
        targetUniqueId = currentUser.userUniqueId;
      }

      // ── 3. user-scoped documents ─────────────────────────────────────────────
      if (ownerType === "user") {
        // Any authenticated user may access only their own user documents.
        if (targetUniqueId === currentUser.userUniqueId) {
          return next();
        }
        // If target differs, only admins (handled above) are allowed.
        throw new AppError(
          "Forbidden: you can only access your own documents.",
          403,
        );
      }

      // ── 4. company-scoped documents ──────────────────────────────────────────
      if (ownerType === "company") {
        // Only CompanyAdmin (7) and Dispatcher (10) can touch company documents.
        const canAccessCompany =
          roleId === usersRolesList.companyAdmin.roleId ||
          roleId === usersRolesList.dispatcher.roleId;

        if (!canAccessCompany) {
          throw new AppError(
            "Forbidden: drivers and shippers cannot access company documents.",
            403,
          );
        }

        // Verify the user is an active member of the specific target company
        // AND their company-role is owner, manager, or dispatcher (not just a driver member).
        const [membershipRows] = await pool.query(
          `SELECT cm.companyUniqueId, cm.companyRoleUniqueId
           FROM CompanyMembership cm
           WHERE cm.userUniqueId = ?
             AND cm.companyUniqueId = ?
             AND cm.isActive = 1
             AND cm.membershipDeletedAt IS NULL
           LIMIT 1`,
          [currentUser.userUniqueId, targetUniqueId],
        );

        if (!membershipRows.length) {
          throw new AppError(
            "Forbidden: you are not a member of this company.",
            403,
          );
        }

        // Only owner, manager, and dispatcher company-roles may access docs.
        // A user with roleId=7/10 who is a plain 'driver' member is still blocked.
        const allowedCompanyRoles = new Set([
          companyRoles.ownerUniqueId,
          companyRoles.managerUniqueId,
          companyRoles.dispatcherUniqueId,
        ]);

        const memberCompanyRoleUniqueId = membershipRows[0].companyRoleUniqueId;
        if (!allowedCompanyRoles.has(memberCompanyRoleUniqueId)) {
          throw new AppError(
            "Forbidden: your company role does not permit access to company documents.",
            403,
          );
        }

        return next();
      }

      // ── 5. vehicle-scoped documents ──────────────────────────────────────────
      if (ownerType === "vehicle") {
        // Drivers may only access documents for vehicles actively assigned to them.
        if (roleId === usersRolesList.driver.roleId) {
          const [assignmentRows] = await pool.query(
            `SELECT vehicleUniqueId FROM VehicleDriver
             WHERE driverUserUniqueId = ?
               AND vehicleUniqueId = ?
               AND assignmentStatus = 'active'
               AND vehicleDriverDeletedAt IS NULL
             LIMIT 1`,
            [currentUser.userUniqueId, targetUniqueId],
          );

          if (!assignmentRows.length) {
            throw new AppError(
              "Forbidden: you are not assigned to this vehicle.",
              403,
            );
          }

          return next();
        }

        // CompanyAdmin / Dispatcher may access vehicle docs if the vehicle
        // belongs to a company they are an active member of.
        if (
          roleId === usersRolesList.companyAdmin.roleId ||
          roleId === usersRolesList.dispatcher.roleId
        ) {
          const [companyVehicleRows] = await pool.query(
            `SELECT cv.companyUniqueId
             FROM CompanyVehicle cv
             INNER JOIN CompanyMembership cm
               ON cm.companyUniqueId = cv.companyUniqueId
             WHERE cv.vehicleUniqueId = ?
               AND cv.assignmentStatus = 'active'
               AND cv.companyVehicleDeletedAt IS NULL
               AND cm.userUniqueId = ?
               AND cm.isActive = 1
               AND cm.membershipDeletedAt IS NULL
             LIMIT 1`,
            [targetUniqueId, currentUser.userUniqueId],
          );

          if (!companyVehicleRows.length) {
            throw new AppError(
              "Forbidden: this vehicle does not belong to your company.",
              403,
            );
          }

          return next();
        }

        // All other roles (shipper, etc.) are denied vehicle doc access.
        throw new AppError(
          "Forbidden: you do not have permission to access vehicle documents.",
          403,
        );
      }

      // ── 6. Fallback deny ─────────────────────────────────────────────────────
      throw new AppError("Forbidden: unknown owner type.", AppError.FORBIDDEN);
    } catch (error) {
      next(error);
    }
  };
};

module.exports = { authorizeDocumentAccess };
