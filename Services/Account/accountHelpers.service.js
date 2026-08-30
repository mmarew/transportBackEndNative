"use strict";






const logger = require("../../Utils/logger");
const {
  pool
} = require("../../Middleware/Database.config");

const {
  getUserSubscriptionsWithFilters,
  createUserSubscription,
  getSubscriptionData
} = require("../UserSubscription");
const AppError = require("../../Utils/AppError");



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
  enableDocumentChecks
}) => {
  // Check if at least one user identifier is provided
  const hasUserIdentifier = ownerUserUniqueId || phoneNumber || email || user?.userUniqueId;
  if (!hasUserIdentifier) {
    throw new AppError("At least one user identifier is required: ownerUserUniqueId, phoneNumber, email, or user.userUniqueId", AppError.BAD_REQUEST);
  }

  // Validate ownerUserUniqueId if provided (not null/undefined)
  if (ownerUserUniqueId !== undefined && ownerUserUniqueId !== null && (typeof ownerUserUniqueId !== "string" || ownerUserUniqueId.trim() === "")) {
    throw new AppError("ownerUserUniqueId must be a non-empty string", AppError.BAD_REQUEST);
  }

  // If ownerUserUniqueId is not provided, require phoneNumber or email
  if (!ownerUserUniqueId && !phoneNumber && !email) {
    throw new AppError("Either ownerUserUniqueId, phoneNumber, or email must be provided to identify the user", AppError.BAD_REQUEST);
  }

  // Validate phoneNumber if provided
  if (phoneNumber !== undefined && (typeof phoneNumber !== "string" || phoneNumber.trim() === "")) {
    throw new AppError("phoneNumber must be a non-empty string", AppError.BAD_REQUEST);
  }

  // Validate email if provided
  if (email !== undefined) {
    if (typeof email !== "string" || email.trim() === "") {
      throw new AppError("email must be a non-empty string", AppError.BAD_REQUEST);
    }
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new AppError("email must be a valid email address", AppError.BAD_REQUEST);
    }
  }

  // Validate user object if provided (allow null for phone/email lookups)
  if (user !== undefined && user !== null) {
    if (typeof user !== "object") {
      throw new AppError("user must be an object", AppError.BAD_REQUEST);
    }
    if (user.userUniqueId && (typeof user.userUniqueId !== "string" || user.userUniqueId.trim() === "")) {
      throw new AppError("user.userUniqueId must be a non-empty string", AppError.BAD_REQUEST);
    }
  }

  // Validate that roleId is available (from body/query or user)
  const hasRoleId = body && body.roleId || user && user.roleId;
  if (!hasRoleId) {
    throw new AppError("roleId is required and must be provided in body.roleId or user.roleId", AppError.BAD_REQUEST);
  }

  // Validate enableDocumentChecks
  if (typeof enableDocumentChecks !== "boolean") {
    throw new AppError("enableDocumentChecks must be a boolean", AppError.BAD_REQUEST);
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

// ========== OPTIMIZED SUBSCRIPTION HELPER ==========
async function checkAndGrantUserSubscription(driverUniqueId) {
  try {
    let wasGranted = false;
    // 1. Check for unassigned free plans (limit to 1)
    //    A grant failure must NEVER abort the active-subscription summary below,
    //    so it is isolated in its own try/catch.
    try {
      const unassignedFreePlans = await getSubscriptionData({
        dataType: "freePlans",
        driverUniqueId,
        page: 1,
        limit: 1
      });

      // 2. Grant if found (but only one at a time)
      if (unassignedFreePlans?.data?.length > 0) {
        const plan = unassignedFreePlans.data[0];
        await createUserSubscription({
          driverUniqueId,
          subscriptionPlanPricingUniqueId: plan.subscriptionPlanPricingUniqueId,
          userSubscriptionCreatedBy: driverUniqueId
        });
        wasGranted = true;
      }
    } catch (error) {
      logger.warn("Free-plan grant skipped", {
        driverUniqueId,
        error: error.message
      });
    }

    // 3. Check active subscriptions (single query)
    const activeSubscriptions = await getUserSubscriptionsWithFilters({
      driverUniqueId,
      isActive: true
    });
    if (activeSubscriptions?.data?.length > 0) {
      const subscriptions = activeSubscriptions.data;
      const firstSubscription = subscriptions[0];
      return {
        hasActiveSubscription: true,
        subscriptionType: firstSubscription.isFree ? "free" : "paid",
        subscriptionDetails: subscriptions,
        wasRecentlyGranted: wasGranted
      };
    }
    return {
      hasActiveSubscription: false,
      subscriptionType: "none",
      subscriptionDetails: null,
      wasRecentlyGranted: wasGranted
    };
  } catch (error) {
    logger.error("Error checking driver subscription", {
      error: error.message,
      stack: error.stack
    });
    throw new AppError("Failed to check subscription status", AppError.INTERNAL_SERVER_ERROR);
  }
}

module.exports = {
  validateAccountStatusParams,
  checkAndGrantUserSubscription
};
