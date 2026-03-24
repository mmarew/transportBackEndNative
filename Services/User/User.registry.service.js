"use strict";

const { v4: uuidv4 } = require("uuid");
const { pool } = require("../../Middleware/Database.config");
const { getData } = require("../../CRUD/Read/ReadData");
const { updateData } = require("../../CRUD/Update/Data.update");
const { insertData } = require("../../CRUD/Create/CreateData");
const { currentDate, addHours } = require("../../Utils/CurrentDate");
const bcrypt = require("bcryptjs");
const { usersRoles, USER_STATUS } = require("../../Utils/ListOfSeedData");
const AppError = require("../../Utils/AppError");
const { transactionStorage } = require("../../Utils/TransactionContext");
const generateOTP = require("../../Utils/GenerateOTP");
const { createUserSubscription } = require("../UserSubscription.service");
const { getPricingWithFilters } = require("../SubscriptionPlanPricing.service");
const {
  getPlaceholderEmail,
  isPlaceholderEmail,
} = require("../../Utils/GetPlaceholderEmail");

// Circular dependency handling
let authService;

const ensureCredentialForUser = async ({ userUniqueId, rawPassword }) => {
  if (!userUniqueId) {
    throw new AppError("userUniqueId required", 400);
  }
  const OTP = rawPassword || generateOTP();
  const phoneOTP = generateOTP();
  const emailOTP = generateOTP();

  // OPTIMIZATION: Parallelize CPU-intensive bcrypt hashing to unblock the event loop
  const [hashedOTP, hashedPhoneVerificationOTP, hashedEmailVerificationOTP] =
    await Promise.all([
      bcrypt.hash(String(OTP), 10),
      bcrypt.hash(String(phoneOTP), 10),
      bcrypt.hash(String(emailOTP), 10),
    ]);

  const conditions = { userUniqueId };
  const existing = await getData({
    tableName: "usersCredential",
    conditions,
  });

  const emailVerificationToken = uuidv4();
  // SECURITY: Standardize expiry to 2 hours as per docs and auth service
  const emailVerificationExpiresAt = addHours(currentDate(), 2);

  if (existing && existing.length > 0) {
    const credentialColAndValues = {
      sharedOTP: hashedOTP,
      hashedPassword: hashedOTP,
    };
    const user = existing?.[0];
    const isPhoneVerified = user?.isPhoneVerified;
    const isEmailVerified = user?.isEmailVerified;
    //if phone is verified update phoneVerificationOTP to hashedOTP
    if (isPhoneVerified) {
      credentialColAndValues.phoneVerificationOTP = hashedOTP;
    } else {
      credentialColAndValues.phoneVerificationOTP = hashedPhoneVerificationOTP;
    }
    //if email is verified update emailVerificationOTP to hashedOTP
    if (isEmailVerified) {
      credentialColAndValues.emailVerificationOTP = hashedOTP;
    } else {
      credentialColAndValues.emailVerificationToken = emailVerificationToken;
      credentialColAndValues.emailVerificationExpiresAt =
        emailVerificationExpiresAt;
      credentialColAndValues.emailVerificationOTP = hashedEmailVerificationOTP;
    }

    const upd = await updateData({
      tableName: "usersCredential",
      updateValues: { ...credentialColAndValues },
      conditions: { userUniqueId },
    });
    if (upd?.affectedRows === 0) {
      throw new AppError("Unable to update credential", 500);
    }
    return { message: "success" };
  }

  const credentialColAndVal = {
    userUniqueId,
    credentialUniqueId: uuidv4(),
    phoneVerificationOTP: hashedPhoneVerificationOTP,
    emailVerificationOTP: hashedEmailVerificationOTP,
    sharedOTP: hashedOTP, // Legacy
    emailVerificationToken,
    emailVerificationExpiresAt,
    hashedPassword: hashedOTP,
    usersCredentialCreatedBy: userUniqueId,
    usersCredentialCreatedAt: currentDate(),
  };
  const ins = await insertData({
    tableName: "usersCredential",
    colAndVal: {
      ...credentialColAndVal,
    },
  });

  if (ins?.affectedRows === 0) {
    throw new AppError("Unable to create credential", 500);
  }
  return { message: "success" };
};

const handleUserRoleStatus = async (
  userUniqueId,
  roleId,
  statusId,
  description = "",
) => {
  const executor = transactionStorage.getStore() || pool;
  //get users role if it was already assigned
  const [existingRoles] = await executor.query(
    "SELECT userRoleId FROM UserRole WHERE userUniqueId = ? AND roleId = ?",
    [userUniqueId, roleId],
  );

  let userRoleId;
  //if user role is not assigned, assign it
  if (existingRoles.length === 0) {
    const userRoleUniqueId = uuidv4();
    const [roleIns] = await executor.query(
      "INSERT INTO UserRole (userRoleUniqueId, userUniqueId, roleId, userRoleCreatedAt, userRoleCreatedBy) VALUES (?, ?, ?, ?, ?)",
      [userRoleUniqueId, userUniqueId, roleId, currentDate(), userUniqueId],
    );
    userRoleId = roleIns.insertId;
  } else {
    userRoleId = existingRoles[0].userRoleId;
  }
  //get users role status if it was already assigned
  const [existingStatus] = await executor.query(
    "SELECT userRoleStatusId FROM UserRoleStatusCurrent WHERE userRoleId = ?",
    [userRoleId],
  );
  //if user role status is not assigned, assign it
  if (existingStatus.length === 0) {
    await executor.query(
      "INSERT INTO UserRoleStatusCurrent (userRoleStatusUniqueId, userRoleId, statusId, userRoleStatusDescription, userRoleStatusCreatedAt, userRoleStatusCreatedBy) VALUES (?, ?, ?, ?, ?, ?)",
      [
        uuidv4(),
        userRoleId,
        statusId,
        description,
        currentDate(),
        userUniqueId,
      ],
    );
  }
  // //if user role status is already assigned, update it
  // else {
  //   await executor.query(
  //     "UPDATE UserRoleStatusCurrent SET statusId = ?, userRoleStatusDescription = ?, userRoleStatusCreatedAt = ? WHERE userRoleId = ?",
  //     [statusId, description, currentDate(), userRoleId],
  //   );
  // }
};

const registerNewUser = async ({
  fullName,
  phoneNumber,
  email,
  roleId,
  statusId,
  requestedFrom,
  createdBy,
}) => {
  const userUniqueId = uuidv4();
  const userCreatedAt = currentDate();
  const userCreatedByParam = createdBy || userUniqueId;

  // Use provided email or generate a placeholder if none exists
  const cleanEmail =
    email && !isPlaceholderEmail(email)
      ? email
      : getPlaceholderEmail(phoneNumber);

  const executor = transactionStorage.getStore() || pool;
  const [userIns] = await executor.query(
    "INSERT INTO Users (userUniqueId, fullName, phoneNumber, email, userCreatedAt, userCreatedBy,isEmailVerified,isPhoneVerified) VALUES (?, ?, ?, ?, ?, ?,?,?)",
    [
      userUniqueId,
      fullName,
      phoneNumber,
      cleanEmail,
      userCreatedAt,
      userCreatedByParam,
      false,
      false,
    ],
  );

  if (userIns.affectedRows === 0) {
    throw new AppError("User registration failed", 500);
  }

  // OPTIMIZATION: Construct userData locally using insertId to avoid a redundant SELECT query
  const userData = {
    userId: userIns.insertId,
    userUniqueId,
    fullName,
    phoneNumber,
    email: cleanEmail,
    userCreatedAt,
    userCreatedBy: userCreatedByParam,
    isEmailVerified: false,
    isPhoneVerified: false,
  };

  await ensureCredentialForUser({ userUniqueId });

  if (!authService) {
    authService = require("./User.auth.service");
  }
  return await authService.handleExistingUser({
    requestedFrom,
    user: userData,
    roleId,
    statusId,
  });
};

const createUser = async (body) => {
  const {
    fullName,
    phoneNumber,
    roleId,
    statusId,
    userRoleStatusDescription,
    requestedFrom,
  } = body;
  let email = body?.email?.trim();
  //if there is no email, generate placeholder email
  if (!email) {
    email = getPlaceholderEmail(phoneNumber);
  }

  // 1. Enforce   phoneNumber
  if (!phoneNumber?.trim()) {
    throw new AppError("Phone number is mandatory for registration.", 400);
  }

  const cleanPhone = String(phoneNumber).trim().replace(/\s/g, "");
  const cleanEmail = email ? String(email).trim().toLowerCase() : null;

  /**
   * IDENTITY LOOKUP STRATEGY:
   * 1. Always look up by Phone (Primary Identity).
   * 2. Only look up by Email if it's NOT a system-generated placeholder.
   *    This avoids identifying different users who might happen to have
   *    placeholder emails (though placeholders are designed to be unique
   *    per phone, this is a safety measure).
   */
  const conditions = {
    phoneNumber: cleanPhone,
  };
  // if email is NOT a placeholder, add it to OR conditions for account lookup
  if (cleanEmail && !isPlaceholderEmail(cleanEmail)) {
    conditions.email = cleanEmail;
  }
  // 2. Check if EITHER identity is already taken to prevent separate accounts
  const { performJoinSelect } = require("../../CRUD/Read/ReadData");
  const existing = await performJoinSelect({
    baseTable: "Users",
    conditions,
    operator: "OR",
    limit: 1,
  });

  if (existing?.length > 0) {
    const user = existing[0];

    /**
     * SECURITY CHECK: Prevent "Identity Hijacking"
     *
     * If the phone number exists but is tied to a DIFFERENT real email,
     * we block the request to prevent account takeover.
     *
     * SPECIAL CASE: "Street Hailing" (takeFromStreet)
     * If a driver is registering a passenger from the street, we allow
     * using the existing phone record even if it has a different email.
     * This ensures the driver isn't blocked by the passenger's app privacy
     * settings while on the road.
     */
    const isSavedEmailPlaceholder = isPlaceholderEmail(user?.email);
    const isInputEmailPlaceholder = isPlaceholderEmail(cleanEmail);
    const isStreetEntry = requestedFrom === "street";

    if (
      !isStreetEntry &&
      user?.email &&
      !isSavedEmailPlaceholder &&
      !isInputEmailPlaceholder &&
      user?.email !== cleanEmail
    ) {
      throw new AppError(
        "This phone number is already registered with a different email address.",
        403,
      );
    }
    //phone dont have placeholder
    if (user?.phoneNumber && user?.phoneNumber !== cleanPhone) {
      throw new AppError(
        "This email address is already registered with a different phone number.",
        403,
      );
    }
    //check if user is deleted
    if (user?.isDeleted || user?.userDeletedAt) {
      throw new AppError("Account has been deleted", 403);
    }
    // User already has an account, handle OTP login
    if (!authService) {
      authService = require("./User.auth.service");
    }
    const userData = {
      requestedFrom,
      user,
      roleId,
      statusId,
      userRoleStatusDescription,
    };

    return await authService.handleExistingUser(userData);
  }

  return await registerNewUser({
    fullName,
    phoneNumber,
    email,
    roleId,
    statusId,
    userRoleStatusDescription,
    requestedFrom: "user",
  });
};

const createUserByAdminOrSuperAdmin = async ({
  body,
  userUniqueId,
  userRoleStatusDescription,
}) => {
  const { fullName, phoneNumber, roleId, statusId } = body;
  let email = body?.email?.trim();

  // Placeholder email if none provided
  if (!email) {
    email = getPlaceholderEmail(phoneNumber);
  }

  const userDataByEmail = await getData({
    tableName: "Users",
    conditions: { email },
  });

  if (userDataByEmail?.[0]) {
    await ensureCredentialForUser({
      userUniqueId: userDataByEmail[0].userUniqueId,
    });
    await handleUserRoleStatus(
      userDataByEmail[0].userUniqueId,
      roleId,
      statusId,
      "",
    );
    if (phoneNumber && userDataByEmail[0].phoneNumber !== phoneNumber) {
      throw new AppError("There is a difference in phone number", 409);
    }
    return {
      message: "success",
      data: "User already exists with this email address",
    };
  }

  const userDataByPhoneNumber = await getData({
    tableName: "Users",
    conditions: { phoneNumber },
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

    // Ensure the user is registered for the new role and status
    await handleUserRoleStatus(
      existingUserUniqueId,
      roleId,
      statusId,
      userRoleStatusDescription,
    );

    // Generate/Update OTP for verification
    await ensureCredentialForUser({ userUniqueId: existingUserUniqueId });

    if (email && existingUser.email && existingUser.email !== email) {
      throw new AppError("There is a difference in email address", 409);
    }

    return {
      message: "success",
      data: "User already exists with this phone number. Role and OTP have been updated.",
    };
  }

  return await registerNewUser({
    fullName,
    phoneNumber,
    email,
    roleId,
    statusId,
    userRoleStatusDescription,
    requestedFrom: "Supper Admin/Admin",
    createdBy: userUniqueId,
  });
};
//some jobs can be done by system itself by written codes not by admin or supper admin or users
const createUserSystem = async () => {
  const fullName = "system";
  const phoneNumber = "+251922112480";
  const email = "system@system.com";
  const roleId = usersRoles.systemRoleId;
  const statusId = USER_STATUS.ACTIVE;

  await createUserByAdminOrSuperAdmin({
    body: {
      fullName,
      phoneNumber,
      email,
      roleId,
      statusId,
      userRoleStatusDescription:
        "this can manage things by itself based on written programs",
    },
    userUniqueId: "system",
  });

  await createUserByAdminOrSuperAdmin({
    body: {
      fullName: "Supper Admin",
      phoneNumber: "+251983222221",
      email: "supperAdmin@supperAdmin.com",
      roleId: usersRoles.supperAdminRoleId,
      statusId: USER_STATUS.ACTIVE,
      userRoleStatusDescription:
        "Supper Admin can manage drivers passengers and admin using api requests",
    },
    userUniqueId: "Supper Admin",
  });
};

module.exports = {
  createUser,
  createUserSystem,
  createUserByAdminOrSuperAdmin,
  registerNewUser,
  ensureCredentialForUser,
  handleUserRoleStatus,
};
