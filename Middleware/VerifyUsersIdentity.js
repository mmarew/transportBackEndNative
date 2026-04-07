const { getData, performJoinSelect } = require("../CRUD/Read/ReadData");
const { pool } = require("./Database.config");
const AppError = require("../Utils/AppError");
const { usersRolesList } = require("../Utils/ListOfSeedData");
const logger = require("../Utils/logger");

// Verify if the user is an Admin and is in an active status
const verifyAdminsIdentity = async (req, res, next) => {
  try {
    const userUniqueId = req?.user?.userUniqueId;

    const sql = `SELECT * FROM UserRole WHERE userUniqueId = ? AND roleId = ? OR roleId = ?`;
    const [userRole] = await pool.query(sql, [
      userUniqueId,
      usersRolesList.admin.roleId,
      usersRolesList.supperAdmin.roleId,
    ]);
    if (!userRole?.length) {
      throw new AppError("User admin role not found", 401);
    }
    req.userRole = userRole;

    // Step 3: Check if the Admin is in an active status
    const adminRole = userRole[0];
    const userRoleStatus = await performJoinSelect({
      baseTable: "UserRoleStatusCurrent",
      joins: [
        {
          table: "Statuses",
          on: "Statuses.statusId = UserRoleStatusCurrent.statusId",
        },
      ],
      conditions: {
        "UserRoleStatusCurrent.userRoleId": adminRole.userRoleId,
      },
      orderBy: "userRoleStatusCreatedAt",
      orderDirection: "DESC",
      limit: 1,
    });

    if (userRoleStatus.length === 0) {
      throw new AppError("Admin's user role status not found", 401);
    }
    req.userRoleStatus = userRoleStatus;

    // Step 4: Check if the Admin is in Active status
    const statusId = userRoleStatus[0]?.statusId;
    if (statusId !== 1) {
      throw new AppError("Admin in inactive status", 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Verify if the user is a Driver and is in an active status
const verifyDriversIdentity = async (req, res, next) => {
  try {
    const userUniqueId = req?.user?.userUniqueId;
    // Step 2: Verify if the user has a Driver role
    const userRoles = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId, roleId: usersRolesList.driver.roleId }, // 2 indicates the Driver role
    });

    if (!userRoles?.length) {
      throw new AppError("Sorry, you are not a valid driver.", 401);
    }
    req.userRole = userRoles[0];

    // Step 3: Check if the Driver is in an active status
    const driverRole = userRoles[0];
    const userRoleStatus = await performJoinSelect({
      baseTable: "UserRoleStatusCurrent",
      joins: [
        {
          table: "Statuses",
          on: "Statuses.statusId = UserRoleStatusCurrent.statusId",
        },
      ],
      conditions: {
        "UserRoleStatusCurrent.userRoleId": driverRole.userRoleId,
      },
    });
    if (userRoleStatus.length === 0) {
      throw new AppError("User role status of driver not found", 401);
    }
    req.userRoleStatus = userRoleStatus[0];
    const statusId = userRoleStatus[0]?.statusId;
    if (process.env.DEBUG_TEST) console.log("@verifyDriversIdentity statusId:", statusId, "data:", userRoleStatus[0]);
    if (statusId !== 1) {
      throw new AppError("Driver in inactive status", 403);
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Verify if the user is NOT a Driver
const verifyIfOperationIsAllowedByUserDriver = async (req, res, next) => {
  try {
    const user = req?.user;
    const userUniqueId = user?.userUniqueId;
    const roleId = user?.roleId;
    const fullUrl = req.originalUrl;

    const userRoles = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId, roleId },
    });

    // If user has driver role (roleId 2), restrict certain updates
    if (userRoles?.some((r) => r.roleId === usersRolesList.driver.roleId)) {
      if (fullUrl === "/api/user/updateUser/self") {
        // Driver can update its email or fullname if it was empty
        if (!user?.fullName || !user?.email) {
          return next();
        }
        throw new AppError("This action is not allowed for drivers.", 403);
      }
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Verify if the user is a Passenger and is in an active status
const verifyPassengersIdentity = async (req, res, next) => {
  try {
    const userUniqueId = req?.user.userUniqueId;

    // Step 2: Verify if the user has a Passenger role
    const userRole = await getData({
      tableName: "UserRole",
      conditions: { userUniqueId, roleId: usersRolesList.passenger.roleId }, // 1 indicates the Passenger role
    });

    if (!userRole?.length) {
      throw new AppError("User passenger role not found", 401);
    }
    req.userRole = userRole;

    // Step 3: Check if the Passenger is in an active status (join UserRole so we always use passenger role's status)
    const passengerRole = userRole[0];
    const userRoleStatus = await performJoinSelect({
      baseTable: "UserRoleStatusCurrent",
      joins: [
        {
          table: "Statuses",
          on: "Statuses.statusId = UserRoleStatusCurrent.statusId",
        },
        {
          table: "UserRole",
          on: "UserRole.userRoleId = UserRoleStatusCurrent.userRoleId",
        },
      ],
      conditions: {
        "UserRoleStatusCurrent.userRoleId": passengerRole.userRoleId,
        "UserRole.roleId": usersRolesList.passenger.roleId, // ensure we use passenger role's status, not driver's
      },
      orderBy: "userRoleStatusCreatedAt",
      orderDirection: "DESC",
      limit: 12,
    });
    logger.debug("@userRoleStatus", userRoleStatus);

    if (userRoleStatus.length === 0) {
      throw new AppError("User passenger role status not found", 401);
    }
    req.userRoleStatus = userRoleStatus;
    const statusId = userRoleStatus[0]?.statusId;
    if (statusId !== 1) {
      throw new AppError(
        `Passenger in inactive status (statusId: ${statusId}). Passengers should have statusId 1 (active).`,
        403,
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Verify if user is cancelling their own request OR is admin/super admin
const verifyCancelPassengerRequestAuthorization = async (req, res, next) => {
  try {
    const { userUniqueId: requestingUserUniqueId, roleId } = req?.user ?? {};
    let targetUserUniqueId = req?.params?.userUniqueId;

    if (!requestingUserUniqueId) {
      throw new AppError("User not authenticated", 401);
    }

    if (!targetUserUniqueId) {
      throw new AppError("userUniqueId parameter is required", 400);
    }

    // Handle "self" - replace with actual userUniqueId from token
    if (targetUserUniqueId === "self") {
      targetUserUniqueId = requestingUserUniqueId;
    }

    // Check if user is cancelling their own request
    if (requestingUserUniqueId === targetUserUniqueId) {
      return next();
    }

    // Check if user is admin (role 3) or super admin (role 6) from token
    const isAdmin =
      roleId === usersRolesList.admin.roleId ||
      roleId === usersRolesList.supperAdmin.roleId;
    if (isAdmin) {
      return next();
    }

    // If we reach here, user is not owner and not admin - deny access
    throw new AppError(
      "Unauthorized: You can only cancel your own requests or must be an admin/super admin",
      403,
    );
  } catch (error) {
    next(error);
  }
};

module.exports = {
  verifyIfOperationIsAllowedByUserDriver,
  verifyAdminsIdentity,
  verifyDriversIdentity,
  verifyPassengersIdentity,
  verifyCancelPassengerRequestAuthorization,
};
