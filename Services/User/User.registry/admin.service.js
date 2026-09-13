"use strict";

const AppError = require("../../../Utils/AppError");
const { executeInTransaction } = require("../../../Utils/DatabaseTransaction");
const { getData } = require("../../../CRUD/Read/ReadData");
const { updateData } = require("../../../CRUD/Update/Data.update");
const {
  getPlaceholderEmail,
  isPlaceholderEmail,
} = require("../../../Utils/GetPlaceholderEmail");
const {
  normalizePhoneNumber,
  phoneNumberVariants,
  areSamePhone,
} = require("../../../Utils/PhoneNumber");
const {
  ensureCredentialForUser,
  handleUserRoleStatus,
} = require("./credentials.service");
const { registerNewUser } = require("./register.service");

/**
 * Ensure an EXISTING user can act in a role: refresh their credential hash and
 * assign the role (with an initial status) if it isn't already held. Shared by
 * the admin/super-admin creation path so the credential + role pair is not
 * duplicated across its email-hit and phone-hit branches.
 *
 * @param {object} params
 * @param {string} params.userUniqueId - Target user.
 * @param {number} params.roleId - Role to ensure.
 * @param {number} [params.statusId] - Initial status when the role is new.
 * @param {string} [params.description] - Reason for the status when created.
 * @param {string} [params.rawPassword] - OTP/password to store for verification.
 * @returns {Promise<void>}
 */
const prepareUserForRole = async ({
  userUniqueId,
  roleId,
  statusId,
  description = "",
  rawPassword,
}) => {
  await ensureCredentialForUser({ userUniqueId, rawPassword });
  await handleUserRoleStatus(userUniqueId, roleId, statusId, description);
};

/**
 * Admin / super-admin user creation.
 *
 * Resolves the target by real email, then by phone, creating the user when
 * unknown and otherwise ensuring the requested role + refreshed credentials.
 * All mutations run inside ONE transaction so a conflict (phone/email mismatch)
 * rolls back every partial change instead of leaving a half-prepared account.
 */
const createUserByAdminOrSuperAdmin = async ({
  body,
  userUniqueId,
  userRoleStatusDescription,
}) => {
  return executeInTransaction(async () => {
    const { fullName, phoneNumber, roleId, statusId } = body;
    let email = body?.email?.trim();

    //if email is not provided create placeholder email
    if (!email) {
      email = getPlaceholderEmail(phoneNumber);
    }
    const userDataByEmail = await getData({
      tableName: "Users",
      conditions: { email },
    });

    if (userDataByEmail?.[0]) {
      await prepareUserForRole({
        userUniqueId: userDataByEmail[0].userUniqueId,
        roleId,
        statusId,
        description: "",
        rawPassword: body?.rawPassword || body?.OTP,
      });
      //
      if (
        !isPlaceholderEmail(email) &&
        phoneNumber &&
        !areSamePhone(userDataByEmail[0].phoneNumber, phoneNumber)
      ) {
        throw new AppError("There is a difference in phone number", AppError.CONFLICT);
      }
      if (!isPlaceholderEmail(email)) {
        return {
          message: "User operation completed",
          data: null,
        };
      }

      if (isPlaceholderEmail(email)) {
        // If we found a user by this placeholder email but their phone number doesn't match,
        // we generate a unique one for the NEW user we are about to create.
        if (!areSamePhone(userDataByEmail[0].phoneNumber, phoneNumber)) {
          email = getPlaceholderEmail(
            // eslint-disable-next-line no-magic-numbers -- random 6-digit suffix for placeholder
            phoneNumber + Math.floor(Math.random() * 1000000),
          );
        } else {
          // Same phone + Same placeholder = Same user. We're done.
          return {
            message: "User operation completed",
            data: null,
          };
        }
      }
    }

    const userDataByPhoneNumber = await getData({
      tableName: "Users",
      conditions: { phoneNumber: phoneNumberVariants(phoneNumber) },
    });

    if (userDataByPhoneNumber?.[0]) {
      const existingUser = userDataByPhoneNumber[0];
      const existingUserUniqueId = existingUser.userUniqueId;

      // Update fullName if user.fullName is not provided before, but now fullName is provided and different
      if (
        !existingUser.fullName &&
        fullName &&
        existingUser.fullName !== fullName
      ) {
        await updateData({
          tableName: "Users",
          updateValues: { fullName },
          conditions: { userUniqueId: existingUserUniqueId },
        });
      }

      // Ensure the user is registered for the new role and status, and refresh
      // the credential hash for verification
      await prepareUserForRole({
        userUniqueId: existingUserUniqueId,
        roleId,
        statusId,
        description: userRoleStatusDescription,
        rawPassword: body?.rawPassword || body?.OTP,
      });

      // Only check for email difference if the PROVIDED email is a real email (not a placeholder)
      if (
        email &&
        !isPlaceholderEmail(email) &&
        existingUser.email &&
        existingUser.email !== email
      ) {
        throw new AppError("There is a difference in email address", AppError.CONFLICT);
      }

      return {
        message: "User operation completed",
        data: null,
      };
    }

    return await registerNewUser({
      fullName,
      phoneNumber: normalizePhoneNumber(phoneNumber),
      email,
      roleId,
      statusId,
      userRoleStatusDescription,
      requestedFrom: "Supper Admin/Admin",
      createdBy: userUniqueId,
      rawPassword: body?.rawPassword || body?.OTP,
    });
  });
};

module.exports.createUserByAdminOrSuperAdmin = createUserByAdminOrSuperAdmin;
