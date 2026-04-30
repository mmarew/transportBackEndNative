const { getVehicleDrivers } = require("./VehicleDriver.service");
const {
  updateUserRoleStatus,
  getUserRoleStatusCurrent,
} = require("./UserRoleStatus.service");
const {
  getRoleDocumentRequirements,
} = require("./RoleDocumentRequirements.service");
const { getUserByFilterDetailed } = require("./User.service");
const { getDriverCompanies } = require("./CompanyVehicle.service");
const logger = require("../Utils/logger");
const { pool } = require("../Middleware/Database.config");
const { usersRoles, USER_STATUS } = require("../Utils/ListOfSeedData");
const {
  getUserSubscriptionsWithFilters,
  createUserSubscription,
  getSubscriptionData,
} = require("./UserSubscription.service");
const AppError = require("../Utils/AppError");
const {
  getUserBalanceByFilterServices,
} = require("./UserBalance.service/UserBalance.get.service");
const { transactionStorage } = require("../Utils/TransactionContext");

/**
 * @fileoverview Account Service
 *
 * Provides comprehensive account status evaluation and user management services.
 * Handles complex business logic for determining user account health based on
 * multiple criteria including bans, vehicles, documents, and subscriptions.
 *
 * Key Features:
 * - Flexible user identification (ID, phone, email)
 * - Priority-based status determination
 * - Parallel data fetching for performance
 * - Transaction support for data consistency
 * - Automatic subscription granting for drivers
 *
 * Status Priority (highest to lowest):
 * 1. Banned (6)
 * 2. No Vehicle (2) - for vehicle-required roles
 * 3. Documents Rejected (4)
 * 4. Documents Missing (3)
 * 5. Documents Pending (5)
 * 6. No Subscription (7) - for drivers
 * 7. Active (1) - all requirements met
 */

/**
 * Validates parameters for accountStatus function
 * @param {Object} params - Parameters to validate
 * @throws {AppError} If validation fails
 */
const validateAccountStatusParams = ({
  ownerUserUniqueId,
  phoneNumber,
  email,
  user,
  body,
  enableDocumentChecks,
}) => {
  // Check if at least one user identifier is provided
  const hasUserIdentifier =
    ownerUserUniqueId || phoneNumber || email || user?.userUniqueId;
  if (!hasUserIdentifier) {
    throw new AppError(
      "At least one user identifier is required: ownerUserUniqueId, phoneNumber, email, or user.userUniqueId",
      400,
    );
  }

  // Validate ownerUserUniqueId if provided (not null/undefined)
  if (
    ownerUserUniqueId !== undefined &&
    ownerUserUniqueId !== null &&
    (typeof ownerUserUniqueId !== "string" || ownerUserUniqueId.trim() === "")
  ) {
    throw new AppError("ownerUserUniqueId must be a non-empty string", 400);
  }

  // If ownerUserUniqueId is not provided, require phoneNumber or email
  if (!ownerUserUniqueId && !phoneNumber && !email) {
    throw new AppError(
      "Either ownerUserUniqueId, phoneNumber, or email must be provided to identify the user",
      400,
    );
  }

  // Validate phoneNumber if provided
  if (
    phoneNumber !== undefined &&
    (typeof phoneNumber !== "string" || phoneNumber.trim() === "")
  ) {
    throw new AppError("phoneNumber must be a non-empty string", 400);
  }

  // Validate email if provided
  if (email !== undefined) {
    if (typeof email !== "string" || email.trim() === "") {
      throw new AppError("email must be a non-empty string", 400);
    }
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError("email must be a valid email address", 400);
    }
  }

  // Validate user object if provided (allow null for phone/email lookups)
  if (user !== undefined && user !== null) {
    if (typeof user !== "object") {
      throw new AppError("user must be an object", 400);
    }
    if (
      user.userUniqueId &&
      (typeof user.userUniqueId !== "string" || user.userUniqueId.trim() === "")
    ) {
      throw new AppError("user.userUniqueId must be a non-empty string", 400);
    }
  }

  // Validate that roleId is available (from body/query or user)
  const hasRoleId = (body && body.roleId) || (user && user.roleId);
  if (!hasRoleId) {
    throw new AppError(
      "roleId is required and must be provided in body.roleId or user.roleId",
      400,
    );
  }

  // Validate enableDocumentChecks
  if (typeof enableDocumentChecks !== "boolean") {
    throw new AppError("enableDocumentChecks must be a boolean", 400);
  }
};

/**
 * Consolidated account status check for a user (documents, vehicle, ban, subscription)
 * @param {Object} params - Parameters object
 * @param {string} [params.ownerUserUniqueId] - Unique ID of the user whose account status is being checked
 * @param {string} [params.phoneNumber] - Phone number to search for user (alternative to ownerUserUniqueId)
 * @param {string} [params.email] - Email to search for user (alternative to ownerUserUniqueId)
 * @param {Object} [params.user] - Authenticated user object (if checking own status)
 * @param {Object} [params.body] - Request body containing roleId and other optional parameters
 * @param {boolean} [params.enableDocumentChecks=true] - Whether to check document requirements
 * @returns {Promise<Object>} Response object with account status, vehicle info, documents, subscription, and final status
 * @example
 * const result = await accountStatus({
 *   ownerUserUniqueId: "uuid-here",
 *   body: { roleId: 2 },
 *   enableDocumentChecks: true
 * });
 */
const accountStatus = async ({
  ownerUserUniqueId,
  phoneNumber,
  email,
  user,
  body,
  enableDocumentChecks = true,
}) => {
  // ========== PARAMETER VALIDATION ==========
  validateAccountStatusParams({
    ownerUserUniqueId,
    phoneNumber,
    email,
    user,
    body,
    enableDocumentChecks,
  });

  // --- Initialize state for all checks ---
  let userVehicle = null;
  let banData = null;
  let subscriptionInfo = {
    hasActiveSubscription: false,
    subscriptionType: "none",
    subscriptionDetails: null,
  };
  let attachedDocumentsByStatus = { PENDING: [], ACCEPTED: [], REJECTED: [] };
  let unAttachedDocumentTypes = [];
  let requiredDocuments = [];
  let userBalance = [];

  try {
    // ========== STEP 0: RESOLVE USER CONTEXT ==========
    let effectiveUser = user;
    let resolvedUserUniqueId = ownerUserUniqueId;
    const requestedRoleId = body?.roleId; // From query (controller sets req.query.roleId when self + no query roleId)

    // If ownerUserUniqueId is not provided, try to resolve by phone or email
    if (!resolvedUserUniqueId && (phoneNumber || email)) {
      // First, find the user by phone/email WITHOUT roleId filter
      // (roleId filter would exclude users who don't have that role)
      // We use limit=1 because for account status we only need one specific user
      // If multiple users match (e.g., partial phone number), we take the first match
      const userFilters = {};
      if (phoneNumber) {
        userFilters.phoneNumber = phoneNumber;
      }
      if (email) {
        userFilters.email = email;
      }
      // Don't include roleId here - we'll check it separately

      const userResult = await getUserByFilterDetailed(userFilters, 1, 1);
      if (
        userResult?.message === "success" &&
        userResult?.data?.[0]?.user?.userUniqueId
      ) {
        const firstEntry = userResult.data[0];
        const u = firstEntry.user;
        resolvedUserUniqueId = u.userUniqueId;
        const rolesAndStatuses = firstEntry.rolesAndStatuses || [];
        const roleEntry = requestedRoleId
          ? rolesAndStatuses.find(
            (rs) => rs?.userRoles?.roleId === requestedRoleId,
          )
          : rolesAndStatuses[0];

        if (!roleEntry) {
          if (requestedRoleId) {
            throw new AppError(
              `User found but does not have role ID ${requestedRoleId}`,
              404,
            );
          }
          throw new AppError("User found but has no role assignment", 404);
        }

        const rs = roleEntry.userRoleStatuses || {};
        effectiveUser = {
          userUniqueId: u.userUniqueId,
          fullName: u.fullName,
          phoneNumber: u.phoneNumber,
          email: u.email,
          roleId: roleEntry.userRoles.roleId,
          userRoleId: roleEntry.userRoles.userRoleId,
          userRoleUniqueId: roleEntry.userRoles.userRoleUniqueId,
          roleName: roleEntry.userRoles.roleName,
          statusId: rs.statusId,
          userRoleStatusUniqueId: rs.userRoleStatusUniqueId,
          statusName: rs.statusName,
        };
      } else {
        // User not found by phone/email
        throw new AppError(
          "User not found with the provided phone number or email",
          404,
        );
      }
    } else if (
      !effectiveUser ||
      (resolvedUserUniqueId && resolvedUserUniqueId !== user?.userUniqueId)
    ) {
      // Resolve by ownerUserUniqueId if provided
      const userDataParams = { userUniqueId: resolvedUserUniqueId };
      if (requestedRoleId) {
        userDataParams.roleId = requestedRoleId;
      }

      const userData = await getUserRoleStatusCurrent({
        data: userDataParams,
      });
      effectiveUser = userData?.data?.[0];
    }

    if (!effectiveUser) {
      throw new AppError("User not found", 404);
    }

    // Update resolvedUserUniqueId from effectiveUser if not already set
    if (!resolvedUserUniqueId && effectiveUser?.userUniqueId) {
      resolvedUserUniqueId = effectiveUser.userUniqueId;
    }

    const roleId = effectiveUser?.roleId ?? requestedRoleId;
    const effectivePhoneNumber = effectiveUser?.phoneNumber || phoneNumber;
    const userRoleStatusDescription = body?.userRoleStatusDescription;

    if (!roleId) {
      throw new AppError("Role ID is required", 400);
    }

    // ========== STEP 1: FETCH USER ROLE STATUS (Once) ==========
    // Use userUniqueId directly if available, otherwise use phoneNumber for search
    const userRoleStatusParams = { roleId };
    if (resolvedUserUniqueId) {
      userRoleStatusParams.userUniqueId = resolvedUserUniqueId;
    } else if (effectivePhoneNumber) {
      userRoleStatusParams.search = effectivePhoneNumber;
    }

    const userRoleStatus = await getUserRoleStatusCurrent({
      data: userRoleStatusParams,
    });

    if (!userRoleStatus || userRoleStatus?.data?.length === 0) {
      throw new AppError("User role status not found", 404);
    }

    const { userRoleStatusUniqueId, userRoleId, statusId } =
      userRoleStatus.data[0];

    logger.debug("@accountStatus resolved context", {
      roleId,
      requestedRoleId: body?.roleId,
      resolvedUserUniqueId: resolvedUserUniqueId?.slice(0, 8) + "...",
      storedStatusId: statusId,
    });

    // Account deleted: do not recompute status or run checks
    if (Number(statusId) === USER_STATUS.ACCOUNT_DELETED) {
      return {
        message: "success",
        messageType: "accountStatus",
        vehicle: null,
        userData: userRoleStatus.data[0] || null,
        attachedDocumentsByStatus: null,
        unAttachedDocumentTypes: [],
        requiredDocuments: [],
        subscription: null,
        status: USER_STATUS.ACCOUNT_DELETED,
        reason: "Account deleted",
        banData: null,
      };
    }

    // ========== STEP 2: PARALLELIZE ALL INDEPENDENT CHECKS ==========
    const requiresVehicle = [
      usersRoles.driverRoleId,
      usersRoles.vehicleOwnerRoleId,
    ].includes(Number(roleId));

    const [
      banCheck,
      vehicleCheck,
      requiredDocsResult,
      subscriptionCheck,
      userBalanceCheck,
      companiesCheck,
    ] = await Promise.allSettled([
      // 1. Ban Check
      (async () => {
        try {
          const bannedUsersService = require("./BannedUsers.service");
          return await bannedUsersService.getBannedUsers({
            search: effectivePhoneNumber,
            roleId,
          });
        } catch (e) {
          logger.error("Error checking banned users", {
            error: e.message,
            stack: e.stack,
          });
          return null;
        }
      })(),

      // 2. Vehicle Check
      requiresVehicle
        ? getVehicleDrivers({
          driverUserUniqueId: resolvedUserUniqueId,
          assignmentStatus: "active",
          limit: 1,
          page: 1,
        })
        : Promise.resolve({ data: [] }),

      // 3. Document Requirements List
      enableDocumentChecks
        ? getRoleDocumentRequirements({
          roleId,
          page: 1,
          limit: 1000,
          sortBy: "documentTypeId",
          sortOrder: "ASC",
        })
        : Promise.resolve({ data: [] }),

      // 4. Subscription Check (Drivers Only)
      Number(roleId) === usersRoles.driverRoleId
        ? checkAndGrantUserSubscription(resolvedUserUniqueId)
        : Promise.resolve(null),

      // 5. User Balance Check (Drivers Only)
      Number(roleId) === usersRoles.driverRoleId
        ? getUserBalanceByFilterServices(
          { userUniqueId: resolvedUserUniqueId, page: 1, limit: 1 },
        )
        : Promise.resolve(null),

      // 6. Company Memberships (Drivers Only)
      Number(roleId) === usersRoles.driverRoleId
        ? getDriverCompanies(resolvedUserUniqueId)
        : Promise.resolve([]),
    ]);
    //--- Process User Balance Check Result ---
    if (
      userBalanceCheck.status === "fulfilled" &&
      userBalanceCheck.value?.data?.[0]
    ) {
      userBalance = userBalanceCheck.value.data[0];
    }
    // --- Process Ban Check Result ---
    if (banCheck.status === "fulfilled" && banCheck.value?.data) {
      banData = banCheck.value.data;
    }

    // --- Process Vehicle Check Result ---
    const Vehicle =
      vehicleCheck.status === "fulfilled" ? vehicleCheck.value?.data || [] : [];
    if (Vehicle.length > 0) {
      userVehicle = Vehicle[0];
    }

    // --- Process Document Requirements & Status ---
    if (enableDocumentChecks && requiredDocsResult.status === "fulfilled") {
      requiredDocuments = requiredDocsResult.value?.data || [];
      if (requiredDocuments.length > 0) {
        const sql = `
          SELECT
            ad.*,
            dt.*,
            rdr.*,
            CASE
              WHEN ad.attachedDocumentId IS NULL THEN 'NOT_ATTACHED'
              ELSE ad.attachedDocumentAcceptance
            END as doc_status
          FROM RoleDocumentRequirements rdr
          JOIN DocumentTypes dt ON rdr.documentTypeId = dt.documentTypeId
          LEFT JOIN AttachedDocuments ad ON ad.documentTypeId = dt.documentTypeId
            AND ad.userUniqueId = ?
            AND ad.attachedDocumentAcceptance != 'DELETED'
          WHERE rdr.roleId = ?
          ORDER BY dt.documentTypeId
        `;
        const executor = transactionStorage.getStore() || pool;
        const [allDocs] = await executor.query(sql, [
          resolvedUserUniqueId,
          roleId,
        ]);
        allDocs.forEach((doc) => {
          if (doc.doc_status === "NOT_ATTACHED") {
            unAttachedDocumentTypes.push(doc);
          } else if (attachedDocumentsByStatus[doc.doc_status]) {
            attachedDocumentsByStatus[doc.doc_status].push(doc);
          }
        });
      }
    }

    // --- Process Subscription Check Result ---
    if (subscriptionCheck.status === "fulfilled" && subscriptionCheck.value) {
      subscriptionInfo = subscriptionCheck.value;
    }

    // ========== STEP 3: DETERMINE FINAL STATUS BASED ON PRIORITY ==========
    // Only mandatory docs (isDocumentMandatory === 1) block status; optional docs (0) do not impede active (1)
    const isMandatory = (doc) => Number(doc?.isDocumentMandatory) === 1;
    const unAttachedMandatory = unAttachedDocumentTypes.filter(isMandatory);
    const hasRejectedMandatory =
      attachedDocumentsByStatus.REJECTED.some(isMandatory);
    const hasPendingMandatory =
      attachedDocumentsByStatus.PENDING.some(isMandatory);

    const applyDocumentRules = Number(roleId) === usersRoles.driverRoleId;

    let finalStatusId = 1; // Default: Active
    let reason = "All requirements satisfied";

    // Priority 1: Banned (6)
    if (banData?.isBanned) {
      finalStatusId = USER_STATUS.INACTIVE_USER_IS_BANNED_BY_ADMIN;
      reason = "User is banned";
    }
    // Priority 2: No Vehicle (2) - driver/vehicle-owner only
    else if (requiresVehicle && !userVehicle) {
      finalStatusId = USER_STATUS.INACTIVE_VEHICLE_NOT_REGISTERED;
      reason = "No vehicle registered for this role";
    }
    // Priority 3–5: Document status (4,3,5) - only when mandatory docs are rejected/missing/pending
    else if (applyDocumentRules && hasRejectedMandatory) {
      finalStatusId = USER_STATUS.INACTIVE_DOCUMENTS_REJECTED;
      reason = "One or more documents have been rejected";
    } else if (applyDocumentRules && unAttachedMandatory.length > 0) {
      finalStatusId = USER_STATUS.INACTIVE_REQUIRED_DOCUMENTS_MISSING;
      reason = "Some required documents are not attached";
    } else if (applyDocumentRules && hasPendingMandatory) {
      finalStatusId = USER_STATUS.INACTIVE_DOCUMENTS_PENDING;
      reason = "One or more documents are pending review";
    }
    // Priority 6: No Subscription (7) - driver only.
    // Driver can work by 2 optional ways: (1) active subscription OR (2) balance to pay by commission.
    // If both fail → set INACTIVE_DRIVER_DOESN_T_HAVE_A_SUBSCRIPTION.
    else if (Number(roleId) === usersRoles.driverRoleId) {
      const hasActiveSubscription = Boolean(
        subscriptionInfo?.hasActiveSubscription,
      );
      //get current net balance of the user from userBalance
      const netBalanceOfUser = Number(userBalance?.Balance?.netBalance ?? 0);
      const canPayByCommission = netBalanceOfUser > 0;

      if (!hasActiveSubscription && !canPayByCommission) {
        finalStatusId = USER_STATUS.INACTIVE_DRIVER_DOESN_T_HAVE_A_SUBSCRIPTION;
        reason =
          "Driver doesn't have an active subscription or balance to do by commission charges";
      }
    }

    // ========== STEP 4: UPDATE STATUS IF CHANGED ==========
    if (statusId !== finalStatusId) {
      await updateUserRoleStatus({
        user: effectiveUser,
        roleId,
        userRoleStatusUniqueId,
        userRoleId,
        newStatusId: finalStatusId,
        userRoleStatusDescription,
        phoneNumber: effectivePhoneNumber,
      });
    }

    // Get latest user data using userUniqueId directly for accuracy
    const latestUserDataParams = { roleId };
    if (resolvedUserUniqueId) {
      latestUserDataParams.userUniqueId = resolvedUserUniqueId;
    } else if (effectivePhoneNumber) {
      latestUserDataParams.search = effectivePhoneNumber;
    }

    const latestUserData = await getUserRoleStatusCurrent({
      data: latestUserDataParams,
    });
    const driverCompanies =
      companiesCheck.status === "fulfilled" ? companiesCheck.value || [] : [];

    return {
      message: "success",

      userBalance,
      messageType: "accountStatus",
      vehicle: userVehicle,
      userData: latestUserData?.data?.[0] || null,
      attachedDocumentsByStatus,
      unAttachedDocumentTypes,
      requiredDocuments,
      subscription: subscriptionInfo,
      companies: driverCompanies,   // Companies this driver is a member of
      status: finalStatusId,
      reason,
      banData: banData?.isBanned ? banData.banDetails : null,
    };
  } catch (error) {
    logger.error("Error in accountStatus evaluation", {
      error: error.message,
      stack: error.stack,
      params: {
        ownerUserUniqueId,
        phoneNumber,
        email,
        user: user
          ? { userUniqueId: user.userUniqueId, roleId: user.roleId }
          : null,
        body,
      },
    });
    throw new AppError(
      `An error occurred during account status evaluation: ${error.message}`,
      500,
    );
  }
};

// ========== OPTIMIZED SUBSCRIPTION HELPER ==========
async function checkAndGrantUserSubscription(driverUniqueId) {
  try {
    let wasGranted = false;
    // return { driverUniqueId };
    // 1. Check for unassigned free plans (limit to 1)
    const unassignedFreePlans = await getSubscriptionData({
      dataType: "freePlans",
      driverUniqueId,
      page: 1,
      limit: 1,
    });

    // 2. Grant if found (but only one at a time)
    if (unassignedFreePlans?.data?.length > 0) {
      const plan = unassignedFreePlans.data[0];

      await createUserSubscription({
        driverUniqueId,
        subscriptionPlanPricingUniqueId: plan.subscriptionPlanPricingUniqueId,
        userSubscriptionCreatedBy: driverUniqueId,
      });
      wasGranted = true;
    }

    // 3. Check active subscriptions (single query)
    const activeSubscriptions = await getUserSubscriptionsWithFilters({
      driverUniqueId,
      isActive: true,
    });

    if (activeSubscriptions?.data?.length > 0) {
      const subscriptions = activeSubscriptions.data;
      const firstSubscription = subscriptions[0];

      return {
        hasActiveSubscription: true,
        subscriptionType: firstSubscription.isFree ? "free" : "paid",
        subscriptionDetails: subscriptions,
        wasRecentlyGranted: wasGranted,
      };
    }

    return {
      hasActiveSubscription: false,
      subscriptionType: "none",
      subscriptionDetails: null,
      wasRecentlyGranted: wasGranted,
    };
  } catch (error) {
    logger.error("Error checking driver subscription", {
      error: error.message,
      stack: error.stack,
    });
    throw new AppError("Failed to check subscription status", 500);
  }
}

module.exports = {
  accountStatus,
};
