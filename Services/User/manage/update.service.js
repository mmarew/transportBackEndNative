"use strict";

const {
  pool
} = require("../../../Middleware/Database.config");
const {
  getData
} = require("../../../CRUD/Read/ReadData");
const {
  updateData
} = require("../../../CRUD/Update/Data.update");
const {
  currentDate,
  addHours
} = require("../../../Utils/CurrentDate");


const AppError = require("../../../Utils/AppError");

const {
  
  
  usersRolesList
} = require("../../../Utils/ListOfSeedData");
const createJWT = require("../../../Utils/CreateJWT");
const {
  isPlaceholderEmail,
  getPlaceholderEmail
} = require("../../../Utils/GetPlaceholderEmail");
const generateOTP = require("../../../Utils/GenerateOTP");
const bcrypt = require("bcryptjs");
const {
  v4: uuidv4
} = require("uuid");
const {
  recordUserProfileChanges
} = require("../../../Utils/UserProfileHistory");

const updateUser = async body => {
  const {
    userUniqueId,
    fullName,
    phoneNumber,
    email,
    roleId,
    statusId,
    roleIdFromToken
  } = body;

  // Validate required field
  if (!userUniqueId) {
    throw new AppError("userUniqueId is required", 400);
  }
  // 1. Security Check: Block drivers from self-updating (INSA Compliance)
  const userRoles = await getData({
    tableName: "UserRole",
    conditions: {
      userUniqueId
    }
  });
  const isDriver = userRoles?.some(role => role.roleId === usersRolesList?.driver?.roleId);
  const isRequesterAdmin = [usersRolesList?.admin?.roleId, usersRolesList?.supperAdmin?.roleId].includes(roleIdFromToken);
  if (isDriver && !isRequesterAdmin) {
    throw new AppError("Dear user, you are a driver and cannot update your own profile for security reasons. Please contact an admin for assistance.", 403);
  }

  // Fetch current user details to compare contact info
  const [currentUser] = await getData({
    tableName: "Users",
    conditions: {
      userUniqueId
    }
  });
  if (!currentUser) {
    throw new AppError("User not found", 404);
  }
  const updateValues = {};
  const errors = [];

  // Check if email is reserved by another user
  if (email) {
    // if email is placeholder email, skip the check
    const isEmailPlaceholder = isPlaceholderEmail(email);
    if (!isEmailPlaceholder) {
      const userDataByEmail = await getData({
        tableName: "Users",
        conditions: {
          email
        }
      });
      if (userDataByEmail?.length > 0) {
        const savedEmail = userDataByEmail?.[0].email;
        const isSavedEmailPlaceholder = isPlaceholderEmail(savedEmail);
        //if email is provided and previously savedEmail is placeholder but current email is not placeholder, then update the email
        if (isSavedEmailPlaceholder) {
          updateValues.email = email;
        }
        // Check if the found user is different from the current user
        if (userDataByEmail?.[0].userUniqueId !== userUniqueId) {
          errors.push("Email already exists");
        } else {
          // Same user, can update email
          updateValues.email = email;
        }
      } else {
        // Email doesn't exist in the system, can update
        updateValues.email = email;
      }
    }
  }

  // Check if phone number is reserved by another user
  if (phoneNumber) {
    const userDataByPhoneNumber = await getData({
      tableName: "Users",
      conditions: {
        phoneNumber
      }
    });
    if (userDataByPhoneNumber?.length > 0) {
      //check if email is placeHolder
      const savedEmail = userDataByPhoneNumber?.[0].email;
      const isSavedEmailPlaceholder = isPlaceholderEmail(savedEmail);
      //if email is provided and previously savedEmail is placeholder but current email is not placeholder, then update the email
      if (email && isSavedEmailPlaceholder && !isPlaceholderEmail(email)) {
        updateValues.email = email;
      } else if (isSavedEmailPlaceholder) {
        // if savedEmail is placeholder and email is not provided, create new placeholder email and update it
        const newPlaceholderEmail = getPlaceholderEmail(phoneNumber);
        updateValues.email = newPlaceholderEmail;
      }

      // Check if the found user is different from the current user
      if (userDataByPhoneNumber?.[0].userUniqueId !== userUniqueId) {
        errors.push("Phone number already exists");
      } else {
        // Same user, can update phone number
        updateValues.phoneNumber = phoneNumber;

        // SYNC PLACEHOLDER EMAIL: If current email is a placeholder, update it to match new phone
        if (isPlaceholderEmail(currentUser.email)) {
          updateValues.email = getPlaceholderEmail(phoneNumber);
        }
      }
    } else {
      // Phone number doesn't exist in the system, can update
      updateValues.phoneNumber = phoneNumber;

      // SYNC PLACEHOLDER EMAIL: If current email is a placeholder, update it to match new phone
      if (isPlaceholderEmail(currentUser.email)) {
        updateValues.email = getPlaceholderEmail(phoneNumber);
      }
    }
  }

  // Return errors if any
  if (errors.length > 0) {
    throw new AppError(errors.join(", "), 409);
  }

  // Optional fields for update
  if (fullName) {
    updateValues.fullName = fullName;
  }
  const deferredOTP = {};

  // Reset verification flags and generate new credentials if contact info has changed
  if (updateValues.email && updateValues.email !== currentUser.email) {
    updateValues.isEmailVerified = 0;
    const emailVerificationToken = uuidv4();
    const emailVerificationExpiresAt = addHours(currentDate(), 2); // 2 hours expiry
    deferredOTP.emailVerificationToken = emailVerificationToken;
    await updateData({
      tableName: "usersCredential",
      updateValues: {
        emailVerificationToken,
        emailVerificationExpiresAt
        // We don't reset emailVerificationOTP here because it's for verified status normally
      },
      conditions: {
        userUniqueId
      }
    });
  }
  if (updateValues.phoneNumber && updateValues.phoneNumber !== currentUser.phoneNumber) {
    updateValues.isPhoneVerified = 0;
    const phoneVerificationOTP = generateOTP();
    const hashedPhoneVerificationOTP = await bcrypt.hash(String(phoneVerificationOTP), 10);
    deferredOTP.phoneVerificationOTP = phoneVerificationOTP;
    await updateData({
      tableName: "usersCredential",
      updateValues: {
        phoneVerificationOTP: hashedPhoneVerificationOTP
      },
      conditions: {
        userUniqueId
      }
    });
    // For security, changing a phone number MUST force a logout of the current session
    deferredOTP.forceLogout = true;
  }

  // Update the user's information if there are any fields to update
  if (Object.keys(updateValues).length > 0) {
    const updateUserResult = await updateData({
      tableName: "Users",
      updateValues,
      conditions: {
        userUniqueId
      }
    });
    if (updateUserResult.affectedRows <= 0) {
      throw new AppError("Failed to update user details", 500);
    }

    // Write one history row per field that actually changed
    await recordUserProfileChanges({
      userUniqueId,
      oldData: currentUser,
      newData: updateValues,
      changedBy: body.roleIdFromToken ? userUniqueId : userUniqueId // self or admin — both stored
    });
  }

  // Fetch the latest user info to get verification flags and mandatory fields for JWT
  const [updatedUser] = await getData({
    tableName: "Users",
    conditions: {
      userUniqueId
    }
  });

  // Also catch the role from UserRole if not provided in body
  let effectiveRoleId = roleId;
  if (!effectiveRoleId) {
    const roles = await getData({
      tableName: "UserRole",
      conditions: {
        userUniqueId
      }
    });
    effectiveRoleId = roles?.[0]?.roleId;
  }

  // Create new token with updated information
  const tokenData = createJWT({
    userUniqueId,
    fullName: fullName || updatedUser?.fullName,
    phoneNumber: phoneNumber || updatedUser?.phoneNumber,
    email: email || updatedUser?.email,
    roleId: effectiveRoleId,
    statusId: statusId || updatedUser?.statusId,
    isPhoneVerified: !!updatedUser?.isPhoneVerified,
    isEmailVerified: !!updatedUser?.isEmailVerified
  });
  if (tokenData.message === "error") {
    throw new AppError(tokenData.error || "Token creation failed", 500);
  }
  return {
    token: tokenData.token,
    message: "User updated",
    data: updatedUser,
    deferredOTP // Return OTP/Token for controller to send
  };
};

module.exports = {
  updateUser
};
