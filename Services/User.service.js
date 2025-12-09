// services/userService.js
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../Middleware/Database.config");
const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { updateData } = require("../CRUD/Update/Data.update");
const { sendOtpViaWebSocket } = require("../Utils/WsServerResponder");
const { sendSms } = require("../Utils/smsSender");
const createJWT = require("../Utils/CreateJWT");
const currentDate = require("../Utils/CurrentDate");
const { insertData } = require("../CRUD/Create/CreateData");
const { sendSocketIONotificationToAdmin } = require("../Utils/Notifications");
const bcrypt = require("bcryptjs");
const verifyPassword = require("../Utils/VerifyPassword");
const {
  driversDocumentVehicleRequirement,
} = require("./RoleDocumentRequirements.service");
const { usersRoles, usersRolesList } = require("../Utils/ListOfFixedData");
const { getUserRoleListByFilter } = require("./UserRole.service");
const { getUserRoleStatusCurrent } = require("./UserRoleStatus.service");
const { createFreeGiftToDriver } = require("./FreeGiftToDriver.service");
const {
  getAllSubscriptionPlansWithPricing,
} = require("./SubscriptionPlan.service");
const { promises } = require("stream");

const createUserSystem = async (body) => {
  const fullName = "system",
    phoneNumber = "+251922112480",
    email = "system@system.com",
    roleId = usersRoles.systemRoleId,
    statusId = 1,
    userRoleStatusDescription =
      "this can manage things by itself based on written programs";

  const responseOfSystem = await createUserByAdminOrSuperAdmin({
    body: {
      fullName,
      phoneNumber,
      email,
      roleId,
      statusId,
      userRoleStatusDescription,
      requestedFrom: "system",
    },
    userUniqueId: "system",
  });
  console.log("@responseOfSystem", responseOfSystem);
  const responseOfSupperAdmin = await createUserByAdminOrSuperAdmin({
    body: {
      fullName: "Supper Admin",
      phoneNumber: "+251983222221",
      email: "supperAdmin@supperAdmin.com",
      roleId: usersRoles.supperAdminRoleId,
      statusId: 1,
      userRoleStatusDescription:
        "Supper Admin can manage drivers passengers and admin using api requests",
      requestedFrom: "Supper Admin",
    },
    userUniqueId: "Supper Admin",
  });
  console.log("@responseOfSupperAdmin", responseOfSupperAdmin);
  return;
};

// Ensure a credential exists for a user; update if exists, insert if not
const ensureCredentialForUser = async ({ userUniqueId, rawPassword }) => {
  try {
    if (!userUniqueId)
      return { message: "error", error: "userUniqueId required" };
    const OTP = rawPassword || Math.floor(100000 + Math.random() * 900000);
    const hashed = await bcrypt.hash(String(OTP), 10);
    const existing = await getData({
      tableName: "usersCredential",
      conditions: { userUniqueId },
    });
    if (existing && existing.length > 0) {
      const upd = await updateData({
        tableName: "usersCredential",
        updateValues: { OTP: hashed, hashedPassword: hashed },
        conditions: { userUniqueId },
      });
      if (upd?.affectedRows > 0) return { message: "success" };
      return { message: "error", error: "Unable to update credential" };
    }
    const ins = await insertData({
      tableName: "usersCredential",
      colAndVal: {
        credentialUniqueId: uuidv4(),
        userUniqueId,
        OTP: hashed,
        hashedPassword: hashed,
        usersCredentialCreatedAt: new Date(),
      },
    });
    if (ins?.affectedRows > 0) return { message: "success" };
    return { message: "error", error: "Unable to insert credential" };
  } catch (e) {
    console.log("@ensureCredentialForUser error", e?.message || e);
    return { message: "error", error: "Server error ensuring credential" };
  }
};

const handleExistingUser = async ({
  requestedFrom,
  user,
  roleId,
  statusId,
  userRoleStatusDescription = "no description",
}) => {
  const userUniqueId = user.userUniqueId;
  if (!userUniqueId)
    return {
      message: "error",
      error: "wrong user data",
    };

  // Generate OTP
  const OTP = Math.floor(100000 + Math.random() * 900000);

  const [credential] = await Promise.all([
    getData({
      tableName: "usersCredential",
      conditions: { userUniqueId },
    }),
    // Handle existing user: Insert/Update roles and statuses
    handleUserRoleStatus(
      user.userUniqueId,
      roleId,
      statusId,
      userRoleStatusDescription
    ),
  ]);
  console.log("@credential", credential);
  // create new credential if it does not exist
  if (credential?.length === 0) {
    //create new credential by hashing OTP
    const hashedOtps = await bcrypt.hash(String(OTP), 10);
    await insertData({
      tableName: "usersCredential",
      colAndVal: {
        credentialUniqueId: uuidv4(),
        userUniqueId,
        OTP: hashedOtps,
        hashedPassword: hashedOtps,
        usersCredentialCreatedAt: new Date(),
      },
    });
  }

  console.log("to be hashed otp ", OTP); //to be hashed otp  615949
  const hashedOTP = await bcrypt.hash(String(OTP), 10);
  console.log("hashedOTP", hashedOTP);
  if (requestedFrom == "street") {
    return {
      dataOfPassenger: user,
      message: "success",
      dataOfPassenger: user,
    };
  }
  // Update OTP for existing user

  const otpUpdated = await updateOtpForUser({
    userUniqueId: user.userUniqueId,
    hashedOTP: hashedOTP,
    phoneNumber: user.phoneNumber,
    OTP,
  });
  return { ...otpUpdated, dataOfPassenger: user };
};

// utils/registerNewUser.js
const registerNewUser = async ({
  fullName,
  phoneNumber,
  email,
  roleId,
  statusId,
  userRoleStatusDescription,
  requestedFrom,
  createdBy = "system",
}) => {
  const userUniqueId = uuidv4();
  const credentialUniqueId = uuidv4();
  const OTP = Math.floor(100000 + Math.random() * 900000);
  const hashedOtps = await bcrypt.hash(String(OTP), 10);

  const dataOfPassenger = {
    userUniqueId,
    fullName,
    phoneNumber,
    email,
    createdAt: currentDate(),
    createdBy,
  };

  const insertedUser = await insertData({
    tableName: "Users",
    colAndVal: dataOfPassenger,
  });

  const insertedCredential = await insertData({
    tableName: "usersCredential",
    colAndVal: {
      credentialUniqueId,
      userUniqueId,
      OTP: hashedOtps,
      hashedPassword: hashedOtps,
      usersCredentialCreatedAt: new Date(),
    },
  });

  const userCreationSuccess = [insertedCredential, insertedUser];

  const allInserted = userCreationSuccess.every((res) => res?.affectedRows > 0);

  if (!allInserted) {
    return {
      message: "error",
      data: "An error occurred during user creation",
    };
  }

  await handleUserRoleStatus(
    userUniqueId,
    roleId,
    statusId,
    userRoleStatusDescription
  );

  if (requestedFrom === "user") {
    // send otp to users via AfroMessage SMS
    const smsResult = await sendSms(phoneNumber, OTP);
    if (smsResult.message === "success") {
      return {
        message: "success",
        messageDetail: "User created successfully, OTP sent successfully",
      };
    }
  }
  // if user is driver give available free gift subscription if it was not given before.
  try {
    if (Number(roleId) === usersRoles.driverRoleId) {
      const plansRes = await getAllSubscriptionPlansWithPricing();
      const plans = plansRes?.data || [];
      // find a free plan
      const freePlan = plans.find((p) => p?.isFree === true || p?.isFree === 1);
      if (freePlan?.subscriptionPlanUniqueId) {
        const giftStartDate = new Date().toISOString().slice(0, 10);
        await createFreeGiftToDriver({
          driverUniqueId: userUniqueId,
          subscriptionPlanUniqueId: freePlan.subscriptionPlanUniqueId,
          giftStartDate,
        });
      }
      // prepare return message
      return {
        dataOfPassenger,
        message: "success",
        messageDetail:
          "User created successfully, free gift subscription added",
      };
    }
    // prepare return message
    return {
      message: "success",
      messageDetail: "User created successfully",
    };
  } catch (e) {
    // ignore gift errors during sign-up to not block user creation
    console.log("@registerNewUser free gift error", e?.message || e);
  }

  return {
    message: "success",
    messageDetail: "User created successfully",
    dataOfPassenger,
  };
};

const createUser = async (req) => {
  const body = req.body;
  const requestedFrom = body?.requestedFrom || "user";
  const {
    fullName,
    phoneNumber,
    email,
    roleId,
    statusId,
    userRoleStatusDescription,
  } = body;

  console.log("@createUser body", body);

  if (roleId >= 3) {
    return { message: "error", error: `you can't create this user` };
  }

  if (!phoneNumber || !roleId || !statusId) {
    return {
      message: "error",
      error: "All fields are required to create a user",
    };
  }

  try {
    let conditions = {};
    if (phoneNumber) conditions.phoneNumber = phoneNumber;
    if (email) conditions.email = email;

    const savedUser = await getData({
      tableName: "Users",
      conditions,
      operator: "OR",
    });

    if (savedUser?.length > 1) {
      return {
        message: "error",
        error: "phone or email is reserved in another user",
      };
    }

    if (savedUser.length >= 1) {
      const existingUser = savedUser[0];

      if (phoneNumber !== existingUser.phoneNumber) {
        return {
          message: "error",
          error: "Wrong phone match to current email",
        };
      }

      const savedEmail = existingUser?.email;

      /******************************************************************************
       * MODULE: Passenger Data Update Handler
       *
       * DESCRIPTION:
       * Manages email and name updates for passenger users (roleId = 2).
       * Implements business rules for email verification and data integrity.
       *
       * BUSINESS RULES:
       * 1. Email Protection: Verified emails cannot be changed
       * 2. Email Replacement: Fake emails can be replaced with real ones
       * 3. Name Initialization: Full name can be set once
       *
       * EMAIL TYPES:
       * - Fake Email: fakeEmail_<random>@passenger.com (can be replaced)
       * - Real Email: Any other format (cannot be changed)
       *
       * ERROR CASES:
       * - Attempt to change verified email → "Wrong email match to current phone number"
       *
       * @param {number} roleId - User role identifier (1 = passenger,2=driver etc)
       * @param {string} savedEmail - Current email in database
       * @param {string} email - New email to set
       * @param {string} fullName - New full name to set
       * @param {Object} existingUser - Complete user record
       ******************************************************************************/

      if (roleId == 2) {
        // [Rule 1] Prevent verified email changes
        if (
          savedEmail &&
          !savedEmail.startsWith("fakeEmail_") &&
          !savedEmail.endsWith("@passenger.com") &&
          email &&
          email !== savedEmail
        ) {
          return {
            message: "error",
            error: "Wrong email match to current phone number",
          };
        }

        // [Rule 2] Allow fake email replacement
        if (
          ((savedEmail?.startsWith("fakeEmail_") &&
            savedEmail?.endsWith("@passenger.com")) ||
            !savedEmail) &&
          email
        ) {
          await updateData({
            tableName: "Users",
            updateValues: { email },
            conditions: { userUniqueId: existingUser.userUniqueId },
          });
        }

        // [Rule 3] Allow initial name setting
        if (!existingUser?.fullName && fullName) {
          await updateData({
            tableName: "Users",
            updateValues: { fullName },
            conditions: { userUniqueId: existingUser.userUniqueId },
          });
        }
      }

      return handleExistingUser({
        user: { ...existingUser },
        roleId,
        statusId,
        userRoleStatusDescription,
        requestedFrom,
        email,
        fullName,
      });
    }

    return await registerNewUser({
      fullName,
      phoneNumber,
      email,
      roleId,
      statusId,
      userRoleStatusDescription,
      requestedFrom,
    });
  } catch (error) {
    console.log("Error in createUser:", error);
    return {
      message: "error",
      data: "An error occurred during user creation",
    };
  }
};

const handleUserRoleStatus = async (
  userUniqueId,
  roleId,
  statusId,
  userRoleStatusDescription
) => {
  try {
    // Check if the UserRole already exists
    const userRole = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId, roleId },
    });
    let userRoleId = null;

    // if user is not found in this role, register new user role
    if (userRole.length === 0) {
      const insertUserRole = await insertData({
        tableName: "UserRole",
        colAndVal: {
          userRoleUniqueId: uuidv4(),
          userUniqueId,
          roleId,
          userRoleCreatedAt: currentDate(),
          userRoleCreatedBy: userUniqueId,
        },
      });

      if (insertUserRole.affectedRows > 0) {
        userRoleId = insertUserRole.insertId;
      }
    } else {
      userRoleId = userRole[0].userRoleId;
    }

    // Check if the UserRole is in UserRoleStatus already exists
    const userRoleStatus = await getData({
      tableName: "UserRoleStatusCurrent",
      conditions: { userRoleId },
    });
    console.log("@userRoleStatus", userRoleStatus);
    if (userRoleStatus.length === 0) {
      const colAndVal = {
        userRoleStatusUniqueId: uuidv4(),
        userRoleStatusCreatedBy: userUniqueId,
        userRoleId,
        userRoleStatusDescription,
        // if role is 2, user is a driver, then statusId will be 2 for driver because drivers data must be active after approval by admin
        statusId: roleId == 2 ? 2 : statusId,
        userRoleStatusCreatedAt: currentDate(),
      };

      // Insert new UserRoleStatus if not found
      await insertData({
        tableName: "UserRoleStatusCurrent",
        colAndVal,
      });
      const newUser = await performJoinSelect({
        baseTable: "Users",
        joins: [
          {
            table: "UserRole",
            on: "Users.userUniqueId = UserRole.userUniqueId",
          },
          {
            table: "UserRoleStatusCurrent",
            on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
          },
        ],
        conditions: { "Users.userUniqueId": userUniqueId },
      });
      // if user is driver send notification to admin to verify its account using driver license etc
      if (roleId == 2) {
        const message = {
          type: "unauthorizedDriver",
          ...newUser[0],
        };
        await sendSocketIONotificationToAdmin({
          message,
        });
      }
      return {
        message: "success",
        data: { ...newUser[0] },
      };
    } else {
      return {
        message: "success",
      };
    }
  } catch (error) {
    console.log("Error in handleUserRoleStatus:", error);
    throw error;
  }
};

// Helper function to update OTP and send notification
const updateOtpForUser = async ({
  userUniqueId,
  OTP,
  phoneNumber,
  hashedOTP,
}) => {
  const updateOtpResult = await updateData({
    tableName: "usersCredential",
    updateValues: { OTP: hashedOTP },
    conditions: { userUniqueId },
  });

  if (updateOtpResult.affectedRows > 0) {
    const smsResult = await sendSms(phoneNumber, OTP);
    if (smsResult.message === "success") {
      return {
        message: "success",
        messageDetail: "OTP updated and sent successfully",
      };
    } else {
      return {
        message: "success",
        messageDetail: "OTP updated and sent successfully",
      };
      // temporary disable sms error
      return smsResult;
    }
  } else {
    return {
      message: "error",
      error: "Unable to update OTP",
    };
  }
};

const verifyUserByOTP = async (req) => {
  try {
    if (!req?.body?.OTP || !req?.body?.phoneNumber) {
      return { message: "error", error: "OTP and phoneNumber are required" };
    }
    const { OTP, phoneNumber } = req.body;
    const verifyUserExistence = await performJoinSelect({
      baseTable: "Users",
      joins: [
        {
          table: "usersCredential",
          on: "Users.userUniqueId = usersCredential.userUniqueId",
        },
      ],
      conditions: {
        phoneNumber,
      },
    });
    console.log("@verifyUserExistence", verifyUserExistence);
    const roleId = req.body.roleId;
    if (!verifyUserExistence || verifyUserExistence.length === 0) {
      return { message: "error", error: "user not found in verify otp" };
    }

    const { userUniqueId, fullName, email } = verifyUserExistence?.[0];
    const hashedOTP = verifyUserExistence[0].OTP;
    const verifyOTP = await verifyPassword({
      hashedPassword: hashedOTP,
      notHashedPassword: OTP,
    });
    if (verifyOTP.error) {
      return { message: "error", error: "OTP verification failed" };
    }
    const conditions = { roleId, userUniqueId };
    console.log("@conditions", conditions);
    const userInRoleId = await getData({
      tableName: "UserRole",
      conditions,
    });

    console.log("@userInRoleId", userInRoleId);
    if (userInRoleId.length === 0) {
      return { message: "error", error: "user not found in this role" };
    }
    const JWTData = createJWT({
      userUniqueId,
      fullName,
      phoneNumber,
      email,
      roleId,
    });
    const resMessage = JWTData.message;
    if (resMessage === "error") {
      return JWTData;
    }

    const token = JWTData.token;
    const resData = {
      token,
      message: "success",
      data: "OTP verified successfully",
    };
    if (roleId != 2) {
      return resData;
    }
    // if user is driver, check if driver has attached documents
    const documentAndVehicleOfDriver = await driversDocumentVehicleRequirement({
      ownerUserUniqueId: userUniqueId,
      user: verifyUserExistence[0],
    });
    if (documentAndVehicleOfDriver?.message === "error") {
      return documentAndVehicleOfDriver;
    }
    const unAttachedDocumentTypes =
        documentAndVehicleOfDriver?.unAttachedDocumentTypes,
      attachedDocumentsByStatus =
        documentAndVehicleOfDriver?.attachedDocumentsByStatus;
    const PENDING = attachedDocumentsByStatus?.PENDING,
      REJECTED = attachedDocumentsByStatus?.REJECTED;

    if (
      PENDING?.length > 0 ||
      REJECTED?.length > 0 ||
      unAttachedDocumentTypes?.length > 0
    )
      sendSocketIONotificationToAdmin({
        message: { ...documentAndVehicleOfDriver },
      });
    resData.documentAndVehicleOfDriver = documentAndVehicleOfDriver;
    console.log("@resData", resData);
    return resData;
  } catch (error) {
    console.log("Error in verifyDriverByOTP:", error.message);
    return { message: "error", error: "Unable to verify user" };
  }
};
const getUserByUserUniqueId = async (userUniqueId) => {
  const user = await getData({
    tableName: "Users",
    conditions: { userUniqueId: userUniqueId },
  });
  if (!user || user.length === 0) {
    return { message: "error", error: "User not found in verify password" };
  }
  return { message: "success", data: user[0] };
};

const getUsersByRoleUniqueId = async (
  roleUniqueId,
  page = 1,
  limit = 10,
  search = ""
) => {
  const offset = (page - 1) * limit;
  const wildcardQuery = `%${search}%`;

  // Count query
  const countSql = `
    SELECT COUNT(*) AS total
    FROM Users u
    INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    INNER JOIN Statuses s ON ursc.statusId = s.statusId
    WHERE r.roleUniqueId = ?
    ${
      search
        ? "AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)"
        : ""
    }
  `;

  const [countRows] = await pool.query(
    countSql,
    search
      ? [roleUniqueId, wildcardQuery, wildcardQuery, wildcardQuery]
      : [roleUniqueId]
  );
  const total = countRows[0].total;

  // Data query
  const sql = `
    SELECT 
      u.userUniqueId,
      u.fullName,
      u.email,
      u.phoneNumber,
      r.roleName,
      ursc.statusId,
      s.statusName,
      ur.userRoleId,
      ur.userRoleCreatedAt
    FROM Users u
    INNER JOIN UserRole ur ON ur.userUniqueId = u.userUniqueId
    INNER JOIN Roles r ON ur.roleId = r.roleId
    INNER JOIN UserRoleStatusCurrent ursc ON ursc.userRoleId = ur.userRoleId
    INNER JOIN Statuses s ON ursc.statusId = s.statusId
    WHERE r.roleUniqueId = ?
    ${
      search
        ? "AND (u.fullName LIKE ? OR u.email LIKE ? OR u.phoneNumber LIKE ?)"
        : ""
    }
    ORDER BY u.createdAt DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await pool.query(
    sql,
    search
      ? [
          roleUniqueId,
          wildcardQuery,
          wildcardQuery,
          wildcardQuery,
          limit,
          offset,
        ]
      : [roleUniqueId, limit, offset]
  );

  return {
    message: "success",
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
    data: rows,
  };
};
const loginUser = async (phoneNumber, roleId) => {
  try {
    // Early validation
    if (!phoneNumber?.trim() || !roleId) {
      return {
        message: "error",
        error: "Phone number and role ID are required.",
      };
    }

    const cleanPhoneNumber = phoneNumber.trim();

    // PARALLEL FETCH: All three queries can run simultaneously
    const [userDataResult, rolesResult, userRoleStatusResult] =
      await Promise.all([
        // 1. Get user by phone number
        getUserByFilterDetailed({ search: cleanPhoneNumber }),

        // 2. Get user roles using phone number as search
        getUserRoleListByFilter({
          search: cleanPhoneNumber, // Use phone number for search
          limit: 10,
          page: 1,
          sortBy: "userRoleCreatedAt",
          sortOrder: "DESC",
        }),

        // 3. Get user role status
        getUserRoleStatusCurrent({
          data: { roleId, search: cleanPhoneNumber },
        }),
      ]);
    console.log("@userRoleStatusResult", userRoleStatusResult);
    // Check user exists
    if (
      userDataResult?.message === "error" ||
      !userDataResult?.data?.[0]?.user
    ) {
      return {
        message: "error",
        error:
          "User not found at this phone/email address. Please sign up first.",
      };
    }

    const userData = userDataResult.data[0].user;

    // Check if user has this role
    // Since we searched by phone number, we need to filter by userUniqueId and roleId
    const userRoles = rolesResult?.data || [];
    const hasRole = userRoles.some(
      (role) =>
        role.userUniqueId === userData.userUniqueId && role.roleId == roleId
    );

    if (!hasRole) {
      return {
        message: "error",
        error:
          "User not found at this role using this address. Please sign up for this role first.",
      };
    }

    const statusId = userRoleStatusResult?.data?.[0]?.statusId;

    const res = await handleExistingUser({
      requestedFrom: "user",
      user: userData,
      roleId,
      statusId,
    });

    return res;
  } catch (error) {
    console.error("Login error:", error);
    return {
      message: "error",
      error: "Login failed. Please try again.",
    };
  }
};

const deleteUser = async (userUniqueId) => {
  // const result = await deleteData({
  //   tableName: "Users",
  //   conditions: { userUniqueId },
  // });
  // const deleteCredential = await deleteData({
  //   tableName: "usersCredential",
  //   conditions: { userUniqueId },
  // });

  //  delete requests of user

  //  delete requests of user
  return { message: "success", data: "user deleted successfully" };
};

const getUserByFilterDetailed = async (filters = {}, page = 1, limit = 10) => {
  // Normalize pagination
  page = Math.max(1, parseInt(page) || 1);
  limit = Math.max(1, Math.min(100, parseInt(limit) || 10));
  const offset = (page - 1) * limit;

  // Build WHERE conditions
  const whereParts = [];
  const params = [];

  // User-level filters
  if (filters.userUniqueId) {
    whereParts.push(`Users.userUniqueId = ?`);
    params.push(filters.userUniqueId);
  }
  if (filters.phoneNumber) {
    whereParts.push(`Users.phoneNumber LIKE ?`);
    params.push(`%${filters.phoneNumber}%`);
  }
  if (filters.email) {
    whereParts.push(`Users.email LIKE ?`);
    params.push(`%${filters.email}%`);
  }
  if (filters.fullName) {
    whereParts.push(`Users.fullName LIKE ?`);
    params.push(`%${filters.fullName}%`);
  }
  if (filters.search) {
    whereParts.push(
      `(Users.fullName LIKE ? OR Users.email LIKE ? OR Users.phoneNumber LIKE ?)`
    );
    params.push(
      `%${filters.search}%`,
      `%${filters.search}%`,
      `%${filters.search}%`
    );
  }
  if (filters.createdAt) {
    if (filters.createdAt.start && filters.createdAt.end) {
      whereParts.push(`Users.createdAt BETWEEN ? AND ?`);
      params.push(filters.createdAt.start, filters.createdAt.end);
    } else {
      whereParts.push(`DATE(Users.createdAt) = ?`);
      params.push(filters.createdAt);
    }
  }

  // Role/status filters
  if (filters.roleId) {
    whereParts.push(`UserRole.roleId = ?`);
    params.push(filters.roleId);
  }
  if (filters.roleUniqueId) {
    whereParts.push(`Roles.roleUniqueId = ?`);
    params.push(filters.roleUniqueId);
  }
  if (filters.statusId) {
    whereParts.push(`UserRoleStatusCurrent.statusId = ?`);
    params.push(filters.statusId);
  }

  const whereClause =
    whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const sql = `
  SELECT DISTINCT
    Users.userId, Users.userUniqueId, Users.fullName, Users.phoneNumber, 
    Users.email, Users.createdAt, Users.createdBy,
    
    UserRole.userRoleId, UserRole.userRoleUniqueId, UserRole.roleId,
    UserRole.userRoleCreatedBy, UserRole.userRoleCreatedAt,
    
    Roles.roleUniqueId, Roles.roleName, Roles.roleDescription,
    
    UserRoleStatusCurrent.userRoleStatusId, UserRoleStatusCurrent.userRoleStatusUniqueId,
    UserRoleStatusCurrent.statusId, UserRoleStatusCurrent.userRoleStatusDescription,
    UserRoleStatusCurrent.userRoleStatusCreatedAt, UserRoleStatusCurrent.userRoleStatusCurrentVersion,
    UserRoleStatusCurrent.userRoleStatusCreatedBy,
    
    Statuses.statusName, Statuses.statusDescription,
    
    BannedUsers.banUniqueId,
    BannedUsers.isActive as banIsActive
    
  FROM Users
  LEFT JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId AND UserRole.userRoleDeletedAt IS NULL
  LEFT JOIN Roles ON UserRole.roleId = Roles.roleId
  LEFT JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId
  LEFT JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
  LEFT JOIN UserDelinquency ON UserRole.userRoleUniqueId = UserDelinquency.userRoleUniqueId
  LEFT JOIN BannedUsers ON UserDelinquency.userDelinquencyUniqueId = BannedUsers.userDelinquencyUniqueId AND BannedUsers.isActive = 1
  ${whereClause}
  ORDER BY Users.createdAt DESC
  LIMIT ? OFFSET ?
`;
  // Updated count SQL
  const countSql = `
    SELECT COUNT(DISTINCT Users.userUniqueId) AS totalCount
    FROM Users
    LEFT JOIN UserRole ON Users.userUniqueId = UserRole.userUniqueId AND UserRole.userRoleDeletedAt IS NULL
    LEFT JOIN Roles ON UserRole.roleId = Roles.roleId
    LEFT JOIN UserRoleStatusCurrent ON UserRole.userRoleId = UserRoleStatusCurrent.userRoleId
    LEFT JOIN Statuses ON UserRoleStatusCurrent.statusId = Statuses.statusId
    LEFT JOIN UserDelinquency ON UserRole.userRoleUniqueId = UserDelinquency.userRoleUniqueId
    LEFT JOIN BannedUsers ON UserDelinquency.userDelinquencyUniqueId = BannedUsers.userDelinquencyUniqueId AND BannedUsers.isActive = 1
    ${whereClause}
  `;
  try {
    const [rowsResult, countResult] = await Promise.all([
      pool.query(sql, [...params, limit, offset]),
      pool.query(countSql, params),
    ]);

    const [rows] = rowsResult;
    const [countRows] = countResult;

    const usersMap = new Map();

    rows.forEach((row) => {
      const userUniqueId = row.userUniqueId;

      if (!usersMap.has(userUniqueId)) {
        // Initialize user with the structure you want
        usersMap.set(userUniqueId, {
          user: {
            userId: row.userId,
            userUniqueId: row.userUniqueId,
            fullName: row.fullName,
            phoneNumber: row.phoneNumber,
            email: row.email,
            createdAt: row.createdAt,
            createdBy: row.createdBy,
          },
          rolesAndStatuses: [],
          banUniqueId: null, // Will be set if any role has a ban
        });
      }

      const userEntry = usersMap.get(userUniqueId);

      // Add role and status information
      if (row.userRoleId) {
        userEntry.rolesAndStatuses.push({
          userRoles: {
            userRoleId: row.userRoleId,
            userRoleUniqueId: row.userRoleUniqueId,
            roleId: row.roleId,
            roleName: row.roleName,
            banUniqueId: row.banUniqueId, // Add banUniqueId to userRoles
          },
          userRoleStatuses: row.userRoleStatusId
            ? {
                statusId: row.statusId,
                statusName: row.statusName,
                userRoleStatusUniqueId: row.userRoleStatusUniqueId,
              }
            : null,
        });

        // Set the overall banUniqueId for the user if any role is banned
        if (row.banUniqueId && !userEntry.banUniqueId) {
          userEntry.banUniqueId = row.banUniqueId;
        }
      }
    });

    // Convert map to array
    const transformedData = Array.from(usersMap.values());

    const totalCount = countRows[0].totalCount || 0;
    const totalPages = Math.ceil(totalCount / limit);

    const paginationInfo = {
      currentPage: page,
      itemsPerPage: limit,
      totalItems: totalCount,
      totalPages,
      offset,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
      nextPage: page < totalPages ? page + 1 : null,
      previousPage: page > 1 ? page - 1 : null,
      startItem: totalCount > 0 ? offset + 1 : 0,
      endItem: Math.min(offset + limit, totalCount),
    };

    // Return the exact structure you specified
    return {
      message: transformedData.length > 0 ? "success" : "No users found",
      data: transformedData,
      pagination: paginationInfo,
    };
  } catch (error) {
    console.error("Database Error:", error);
    return {
      message: "error",
      error: "Failed to retrieve users",
      data: [],
      pagination: {
        currentPage: page,
        itemsPerPage: limit,
        totalItems: 0,
        totalPages: 0,
        offset: offset,
        hasNext: false,
        hasPrevious: false,
        nextPage: null,
        previousPage: null,
        startItem: 0,
        endItem: 0,
      },
    };
  }
};

const updateUser = async (body) => {
  const { userUniqueId, fullName, phoneNumber, email, roleId, statusId } = body;
  // check if email is reserved by another user]
  const userDataByEmail = await getData({
    tableName: "Users",
    conditions: { email },
  });
  console.log("@userDataByEmail", userDataByEmail);
  if (
    userDataByEmail?.length > 0 &&
    userDataByEmail?.[0]?.userUniqueId !== userUniqueId
  ) {
    return {
      message: "error",
      error: "Email already exists",
    };
  }
  const userDataByPhoneNumber = await getData({
    tableName: "Users",
    conditions: { phoneNumber },
  });
  console.log("@userDataByPhoneNumber", userDataByPhoneNumber);
  if (userDataByPhoneNumber?.[0]?.userUniqueId !== userUniqueId) {
    return {
      message: "error",
      error: "Phone number already exists",
    };
  }
  // Ensure required fields are provided
  if (!userUniqueId) {
    return {
      message: "error",
      error: "userUniqueId is required",
    };
  }

  // Optional fields for update
  const updateValues = {};
  if (fullName) updateValues.fullName = fullName;
  if (phoneNumber) updateValues.phoneNumber = phoneNumber;
  if (email) updateValues.email = email;

  try {
    // Update the user's information if there are any fields to update
    if (Object.keys(updateValues).length > 0) {
      const updateUserResult = await updateData({
        tableName: "Users",
        updateValues,
        conditions: { userUniqueId },
      });

      if (updateUserResult.affectedRows <= 0) {
        return {
          message: "error",
          data: "Failed to update user details",
        };
      }
    }
    const tokenData = createJWT({
      userUniqueId,
      fullName,
      phoneNumber,
      email,
      roleId,
    });

    return {
      token: tokenData.token,
      message: "success",
      data: "User updated successfully",
    };
  } catch (error) {
    console.log("Error:", error);
    return {
      message: "error",
      data: "An error occurred during user update",
    };
  }
};
// Create User By Admin Or Super Admin. Register any user with any role
const createUserByAdminOrSuperAdmin = async ({ body, userUniqueId }) => {
  const { fullName, phoneNumber, email, roleId, statusId } = body;
  const userRoleStatusDescription = "";

  const userDataByEmail = await getData({
    tableName: "Users",
    conditions: { email },
  });
  // check if user has credential or not and if not create  credential
  if (userDataByEmail?.[0]) {
    const userUniqueId = userDataByEmail?.[0]?.userUniqueId;
    await ensureCredentialForUser({ userUniqueId });
    await handleUserRoleStatus(
      userUniqueId,
      roleId,
      statusId,
      userRoleStatusDescription
    );
    // if phone number is different from existing user's phone number return error
    if (phoneNumber && userDataByEmail?.[0]?.phoneNumber !== phoneNumber) {
      return {
        message: "error",
        error: "There is a difference in phone number",
      };
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
    const userUniqueId = userDataByPhoneNumber?.[0]?.userUniqueId;
    await ensureCredentialForUser({ userUniqueId });

    await handleUserRoleStatus(
      userUniqueId,
      roleId,
      statusId,
      userRoleStatusDescription
    );
    // if email is different from existing user's email return error
    if (email && userDataByEmail?.[0]?.email !== email) {
      return {
        message: "error",
        error: "There is a difference in email address",
      };
    }
    return {
      message: "success",
      data: "User already exists with this phone number",
    };
  }

  const res = await registerNewUser({
    fullName,
    phoneNumber,
    email,
    roleId,
    statusId,
    userRoleStatusDescription: "",
    requestedFrom: "Supper Admin/Admin",
    createdBy: userUniqueId,
  });
  return res;
};
module.exports = {
  createUserByAdminOrSuperAdmin,
  createUserSystem,
  getUserByUserUniqueId,
  getUsersByRoleUniqueId,
  updateUser,
  verifyUserByOTP,
  createUser,
  deleteUser,
  getUserByFilterDetailed,
  loginUser,
  ensureCredentialForUser,
};
